// ============================================================
// CANDIDATES ROUTER — CRUD + stage management + email triggers
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';
import {
  emailApplicationReceived,
  emailNewApplicationHR,
  dispatchStageEmail,
  emailInterviewerQuestions,
} from '../services/email.js';
import { generateInterviewQuestions } from '../services/ai.js';

const STAGES = [
  'Applied',
  'Assessment',
  'Work Sample',
  'Values Review',
  'Interview Scheduled',
  'Interviewed',
  'Offered',
  'Hired',
  'Rejected',
] as const;

type Stage = typeof STAGES[number];

const CandidateInput = z.object({
  jdId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(300),
  phone: z.string().max(50).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  resumeUrl: z.string().url().optional().or(z.literal('')),
  source: z.string().max(100).optional(),
  notes: z.string().optional(),
});

// Helper: fetch job title for email context
async function getJobTitle(db: any, jdId: string | null | undefined): Promise<string | undefined> {
  if (!jdId) return undefined;
  const jd = await db.query.jobDescriptions.findFirst({
    where: eq(jobDescriptions.id, jdId),
  });
  return jd?.jobTitle;
}

export const candidatesRouter = router({
  list: protectedProcedure
    .input(z.object({
      jdId: z.string().uuid().optional(),
      stage: z.enum(STAGES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.candidates.findMany({
        orderBy: desc(candidates.createdAt),
      });
      let result = rows;
      if (input?.jdId) result = result.filter((c) => c.jdId === input.jdId);
      if (input?.stage) result = result.filter((c) => c.currentStage === input.stage);
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      return candidate;
    }),

  getStageHistory: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.candidateStageHistory.findMany({
        where: eq(candidateStageHistory.candidateId, input.candidateId),
        orderBy: desc(candidateStageHistory.createdAt),
      });
    }),

  create: protectedProcedure
    .input(CandidateInput)
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.insert(candidates).values(input).returning();

      // Log initial stage to history
      await ctx.db.insert(candidateStageHistory).values({
        candidateId: candidate.id,
        fromStage: null,
        toStage: 'Applied',
        changedBy: ctx.user.id,
        reason: 'Application received',
      });

      // Fire emails (non-blocking)
      const jobTitle = await getJobTitle(ctx.db, input.jdId);
      emailApplicationReceived({ ...input, jobTitle }).catch(() => {});
      emailNewApplicationHR({ ...input, jobTitle }).catch(() => {});

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'create');
      trackActivity(ctx.db, ctx.user.id, 'create_candidate', 'candidates', { candidateId: candidate.id }).catch(() => {});
      return candidate;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(CandidateInput.partial()).extend({
      ccatScore: z.number().int().optional(),
      eppValuesMatchScore: z.number().int().optional(),
      workSampleScore: z.number().int().optional(),
      resumeReviewScore: z.number().int().optional(),
      referenceCheckScore: z.number().int().optional(),
      resumeReviewNotes: z.string().optional(),
      referenceCheckNotes: z.string().optional(),
      valuesMatchNotes: z.string().optional(),
      interviewerName: z.string().max(200).optional(),
      interviewerEmail: z.string().email().max(300).optional(),
      zoomMeetingId: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [candidate] = await ctx.db.update(candidates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(candidates.id, id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'update_candidate', 'candidates', { candidateId: id }).catch(() => {});
      return candidate;
    }),

  // Advance a candidate to the next stage
  advanceStage: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      toStage: z.enum(STAGES),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.currentStage === input.toStage) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Candidate is already in that stage' });
      }

      const [candidate] = await ctx.db.update(candidates)
        .set({ currentStage: input.toStage, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();

      // Audit trail
      await ctx.db.insert(candidateStageHistory).values({
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: input.toStage,
        changedBy: ctx.user.id,
        reason: input.reason,
      });

      // Fire emails (non-blocking)
      const jobTitle = await getJobTitle(ctx.db, existing.jdId);
      const jd = existing.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, existing.jdId) })
        : null;
      dispatchStageEmail(input.toStage, existing.currentStage, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        jobTitle,
        workSampleInstructions: jd?.workSampleInstructions ?? undefined,
        interviewerName: (existing as any).interviewerName,
      }).catch(() => {});

      // When advancing to Interview Scheduled:
      // 1. Generate tailored interview questions (AI)
      // 2. Email questions to the interviewer
      if (input.toStage === 'Interview Scheduled') {
        (async () => {
          try {
            const questions = await generateInterviewQuestions({
              firstName: existing.firstName,
              lastName: existing.lastName,
              jobTitle: jobTitle ?? undefined,
              eppProfile: (existing as any).eppProfile,
              eppValuesMatchScore: (existing as any).eppValuesMatchScore,
              resumeReviewNotes: (existing as any).resumeReviewNotes,
              resumeReviewScore: (existing as any).resumeReviewScore,
              referenceCheckNotes: (existing as any).referenceCheckNotes,
              referenceCheckScore: (existing as any).referenceCheckScore,
              workSampleScore: (existing as any).workSampleScore,
              ccatScore: (existing as any).ccatScore,
            });

            // Store questions on candidate record
            await ctx.db.update(candidates)
              .set({ interviewQuestions: questions, updatedAt: new Date() } as any)
              .where(eq(candidates.id, input.id));

            // Email questions to interviewer if email is set
            const interviewerEmail = (existing as any).interviewerEmail;
            if (interviewerEmail) {
              await emailInterviewerQuestions({
                interviewerEmail,
                interviewerName: (existing as any).interviewerName ?? 'Interviewer',
                candidateFirstName: existing.firstName,
                candidateLastName: existing.lastName,
                jobTitle: jobTitle ?? 'the role',
                questions,
              });
            }
          } catch (err) {
            console.error('[AI] Interview question generation failed:', err);
          }
        })();
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'advance_stage', 'candidates', {
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: input.toStage,
      }).catch(() => {});

      return candidate;
    }),

  // Reject a candidate
  reject: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.currentStage === 'Rejected') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Candidate is already rejected' });
      }

      const [candidate] = await ctx.db.update(candidates)
        .set({ currentStage: 'Rejected', rejectionReason: input.reason, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();

      await ctx.db.insert(candidateStageHistory).values({
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: 'Rejected',
        changedBy: ctx.user.id,
        reason: input.reason,
      });

      // Fire rejection email (non-blocking)
      const jobTitle = await getJobTitle(ctx.db, existing.jdId);
      dispatchStageEmail('Rejected', existing.currentStage, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        jobTitle,
      }).catch(() => {});

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'reject_candidate', 'candidates', { candidateId: input.id }).catch(() => {});
      return candidate;
    }),

  // Mark assessment as sent (called when CCAT link is dispatched)
  markAssessmentSent: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({ assessmentSentAt: new Date(), updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),

  // Store AI-generated interview questions
  setInterviewQuestions: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      questions: z.array(z.object({
        category: z.string(),
        question: z.string(),
        rationale: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({ interviewQuestions: input.questions, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),

  // Store Zoom transcript + AI feedback after interview
  setInterviewFeedback: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      transcript: z.string().optional(),
      feedbackHr: z.string(),
      feedbackCandidate: z.string(),
      interviewScore: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({
          interviewTranscript: input.transcript,
          interviewFeedbackHr: input.feedbackHr,
          interviewFeedbackCandidate: input.feedbackCandidate,
          interviewScore: input.interviewScore,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),
});
