import { resolveDeptWorkSample } from '../services/workSampleResolver.js';
// ============================================================
// CANDIDATES ROUTER — CRUD + stage management + email triggers
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { router, protectedProcedure } from '../trpc.js';
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions, emailLog, candidateReferences } from '../db/schema/hiring.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';
import { analyzeEpp } from '../services/eppAnalyzer.js';
import { analyzeInterviewTranscript } from '../services/ai.js';
import { sendAssessment, getScores } from '../services/criteriaCorp.js';
import {
  emailApplicationReceived,
  emailNewApplicationHR,
  dispatchStageEmail,
  emailInterviewerQuestions,
  sendEmail,
  emailOfferLetter,
} from '../services/email.js';
import { generateInterviewQuestions } from '../services/ai.js';
import { screenResumeRequirements } from '../services/ai.js';
import { runReferenceCheck } from '../services/ai.js';
import { renderOfferLetter, type OfferLetterInput } from '../services/offerLetter.js';
import { applyAssessmentDecision } from '../services/assessmentDecision.js';

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
function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

async function getJobTitle(db: any, jdId: string | null | undefined): Promise<string | undefined> {
  if (!jdId) return undefined;
  const jd = await db.query.jobDescriptions.findFirst({
    where: eq(jobDescriptions.id, jdId),
  });
  return jd?.jobTitle;
}

// Build the offer-letter input by pulling defaults from the requisition (intake
// data) and letting explicit inputs override. So HR only confirms the salary
// figure and start date; everything else flows from intake.
async function buildOfferInput(db: any, input: any): Promise<OfferLetterInput> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
  if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const req = jd?.reqId
    ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
    : null;

  const min = req?.salaryMin ?? null;
  const max = req?.salaryMax ?? null;
  const suggested = (min != null && max != null) ? Math.round((min + max) / 2) : (max ?? min ?? null);
  const arrangement = req?.workArrangement && req.workArrangement !== 'On-site'
    ? `${req.workArrangement}${req.hybridDays ? ` (${req.hybridDays} days)` : ''}`
    : null;
  const location = [req?.location, arrangement].filter(Boolean).join(' \u00b7 ') || null;
  const targetStart = req?.targetStartDate
    ? new Date(req.targetStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: input.jobTitle || jd?.jobTitle || 'the role',
    department: input.department ?? req?.department ?? null,
    reportsTo: input.reportsTo ?? req?.hiringManager ?? null,
    employmentType: input.employmentType ?? req?.employmentType ?? 'Full-Time',
    baseSalary: input.baseSalary ?? suggested ?? null,
    startDate: input.startDate ?? targetStart ?? null,
    location: input.location ?? location ?? null,
    addendum: input.addendum ?? [],
  };
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
    .input(CandidateInput.extend({ needsSponsorship: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { needsSponsorship, ...candidateData } = input;
      const [candidate] = await ctx.db.insert(candidates).values(candidateData).returning();

      // Log initial stage to history
      await ctx.db.insert(candidateStageHistory).values({
        candidateId: candidate.id,
        fromStage: null,
        toStage: 'Applied',
        changedBy: ctx.user.id,
        reason: 'Application received',
      });

      const jobTitle = await getJobTitle(ctx.db, candidateData.jdId);

      // Sponsorship knockout: the candidate checked "requires international
      // sponsorship" on the application -> auto-reject on submit. This is the
      // hook the Greenhouse intake maps its sponsorship answer to.
      if (needsSponsorship) {
        await ctx.db.update(candidates)
          .set({
            currentStage: 'Rejected',
            rejectionReason: 'Requires international sponsorship, which Lightspeed does not offer.',
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, candidate.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: candidate.id,
          fromStage: 'Applied',
          toStage: 'Rejected',
          changedBy: ctx.user.id,
          reason: 'Auto-declined on application: requires international sponsorship (not offered).',
        });
        // SendGrid rejection email to the candidate.
        dispatchStageEmail('Rejected', 'Applied', {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});

        await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'create');
        trackActivity(ctx.db, ctx.user.id, 'create_candidate', 'candidates', { candidateId: candidate.id, autoDeclined: 'sponsorship' }).catch(() => {});
        return { ...candidate, currentStage: 'Rejected' as const };
      }

      // Normal path — fire emails (non-blocking)
      emailApplicationReceived({ ...candidateData, jobTitle }).catch(() => {});
      emailNewApplicationHR({ ...candidateData, jobTitle }).catch(() => {});

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

      // If a CCAT score was just set/changed, run the automatic pass/fail decision.
      if (input.ccatScore !== undefined) {
        await applyAssessmentDecision(ctx.db, id);
      }

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
      // Auto-generate + send the work-sample link the moment the candidate
      // reaches the Work Sample stage (i.e. passed the assessment). No manual step.
      let workSampleUrl: string | undefined;
      let workSampleInstructions: string | undefined = jd?.workSampleInstructions ?? undefined;
      if (input.toStage === 'Work Sample') {
        const token = (existing as any).workSampleToken ?? randomUUID();
        if (!(existing as any).workSampleToken) {
          await ctx.db.update(candidates)
            .set({ workSampleToken: token, updatedAt: new Date() })
            .where(eq(candidates.id, input.id));
        }
        workSampleUrl = `${appBaseUrl()}/work-sample/${token}`;
        // Pull the department's work sample from the Work Sample library.
        const resolved = await resolveDeptWorkSample(ctx.db, existing);
        if (resolved) {
          workSampleInstructions =
            `<strong>${resolved.title}</strong><br/><br/>` + resolved.instructions.replace(/\n/g, '<br/>');
        }
      }

      dispatchStageEmail(input.toStage, existing.currentStage, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        jobTitle,
        workSampleInstructions,
        workSampleUrl,
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

  // Screen a resume against the job's REQUIRED qualifications only.
  // Flags missing requirements. Does NOT change stage or reject.
  // Resume screen = decision gate.
  //  - needs international sponsorship  -> auto-reject (knockout)
  //  - missing any REQUIRED qualification -> auto-reject
  //  - all required met                 -> move forward one stage
  // PREFERRED qualifications are "nice-to-haves": never affect the decision;
  // any missing ones are recorded as a note for the hiring manager.
  screenResume: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      resumeText: z.string().min(1),
      needsSponsorship: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const required = ((jd as any)?.requiredQualifications ?? '') as string;
      const preferred = ((jd as any)?.preferredQualifications ?? '') as string;
      const jobTitle = jd?.jobTitle ?? undefined;

      // Screen against must-haves and nice-to-haves separately.
      const requirements = await screenResumeRequirements(input.resumeText, required);
      const niceToHaves = await screenResumeRequirements(input.resumeText, preferred);

      // Build the hiring-manager note.
      const noteParts: string[] = [];
      if (input.needsSponsorship) noteParts.push('KNOCKOUT: requires international sponsorship (not offered).');
      noteParts.push(
        requirements.totalCount
          ? `Requirements: ${requirements.metCount}/${requirements.totalCount} met.`
          : 'No required qualifications defined on this job description.',
      );
      if (requirements.missing.length) noteParts.push(`Missing required: ${requirements.missing.join('; ')}.`);
      if (niceToHaves.missing.length) {
        noteParts.push(`Nice-to-haves missing (FYI, not a dealbreaker): ${niceToHaves.missing.join('; ')}.`);
      } else if (niceToHaves.totalCount) {
        noteParts.push('All nice-to-haves met.');
      }
      const notes = noteParts.join(' ');

      // Decide.
      const terminal = candidate.currentStage === 'Hired' || candidate.currentStage === 'Rejected';
      let decision: 'rejected' | 'advanced' | 'flagged' = 'flagged';
      let reason = '';
      let movedToStage: string | null = null;

      // The requirement reject/advance is only trusted when the REAL AI screened
      // the resume. Without the AI key the keyword fallback is advisory only, so
      // we flag instead of auto-deciding. The sponsorship knockout is a direct
      // yes/no, so it always acts.
      const trustworthy = requirements.mode === 'ai';

      if (input.needsSponsorship) {
        decision = 'rejected';
        reason = 'Requires international sponsorship, which Lightspeed does not offer.';
      } else if (!trustworthy) {
        decision = 'flagged';
        reason = 'Advisory only — set the AI key (ANTHROPIC_API_KEY) for the resume gate to auto-decide.';
      } else if (requirements.missing.length > 0) {
        decision = 'rejected';
        reason = `Missing required qualification(s): ${requirements.missing.join('; ')}.`;
      } else {
        decision = 'advanced';
      }

      // Persist the note regardless of the decision.
      await ctx.db.update(candidates)
        .set({ resumeReviewNotes: notes, updatedAt: new Date() })
        .where(eq(candidates.id, input.id));

      // Apply the stage change (skip if already Hired/Rejected).
      const STAGE_ORDER = STAGES as readonly string[];
      const idx = STAGE_ORDER.indexOf(candidate.currentStage);

      if (!terminal && decision === 'rejected') {
        await ctx.db.update(candidates)
          .set({ currentStage: 'Rejected', rejectionReason: reason, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id,
          fromStage: candidate.currentStage,
          toStage: 'Rejected',
          changedBy: ctx.user.id,
          reason,
        });
        movedToStage = 'Rejected';
        await dispatchStageEmail('Rejected', candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      } else if (!terminal && decision === 'advanced' && idx >= 0 && idx <= 3) {
        // Advance one stage (only through Values Review; never auto-jump interview+).
        const nextStage = STAGE_ORDER[idx + 1];
        await ctx.db.update(candidates)
          .set({ currentStage: nextStage as any, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id,
          fromStage: candidate.currentStage,
          toStage: nextStage as any,
          changedBy: ctx.user.id,
          reason: 'Resume screen passed: all required qualifications met',
        });
        movedToStage = nextStage;
        await dispatchStageEmail(nextStage, candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      } else if (decision === 'advanced') {
        // Passed, but not in an early stage (or terminal): record only, no stage change.
        decision = 'flagged';
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'screen_resume', 'candidates', { candidateId: input.id, decision }).catch(() => {});

      return { decision, reason, movedToStage, requirements, niceToHaves, notes };
    }),

  // Reference check = agent-assembled report of positive signals + concerns for
  // a finalist, run after the interview and before the offer. Informational and
  // human-reviewed: it does NOT change stage or reject. (See ai.ts for the
  // compliance note — no live web-scraping of real applicants.)
  referenceCheck: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jobTitle = await getJobTitle(ctx.db, candidate.jdId);

      // Pull the candidate-provided references that have responded.
      const refs = await ctx.db.query.candidateReferences.findMany({
        where: eq(candidateReferences.candidateId, input.id),
      });
      const responded = refs.filter((r: any) => r.status === 'responded' && r.response);
      const externalReferenceMaterial = responded.length
        ? responded.map((r: any) =>
            `Reference: ${r.name}${r.relationship ? ` (${r.relationship})` : ''}` +
            `${r.wouldRehire ? ` — would rehire: ${r.wouldRehire}` : ''}\n${r.response}`,
          ).join('\n\n')
        : null;

      const result = await runReferenceCheck({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle,
        linkedinUrl: candidate.linkedinUrl,
        notes: candidate.notes,
        interviewFeedbackHr: (candidate as any).interviewFeedbackHr,
        interviewScore: (candidate as any).interviewScore,
        externalReferenceMaterial,
      });

      const report = [
        result.summary,
        result.positives.length ? `Positives: ${result.positives.join('; ')}` : '',
        result.concerns.length ? `Concerns: ${result.concerns.join('; ')}` : '',
        `Recommendation: ${result.recommendation} (confidence ${result.confidence}). ` +
          (result.mode === 'placeholder'
            ? '[AI draft — no external references gathered; connect a reference source]'
            : '[AI draft — verify with real references]'),
      ].filter(Boolean).join('\n');

      await ctx.db.update(candidates)
        .set({ referenceCheckNotes: report, referenceCheckScore: result.confidence, updatedAt: new Date() })
        .where(eq(candidates.id, input.id));

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'reference_check', 'candidates', { candidateId: input.id }).catch(() => {});

      return result;
    }),

  // Build the offer-letter input from the candidate + JD + requisition + HR inputs.
  // Deterministic letter (no AI) — editable fields in fixed places + addendum.
  // (helper below is inlined per-call)

  // Resolve the requisition (intake data) behind a candidate, for offer prefill.
  offerDefaults: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const req = jd?.reqId
        ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
        : null;

      const min = (req as any)?.salaryMin ?? null;
      const max = (req as any)?.salaryMax ?? null;
      const suggestedSalary = (min != null && max != null) ? Math.round((min + max) / 2) : (max ?? min ?? null);
      const arrangement = (req as any)?.workArrangement && (req as any).workArrangement !== 'On-site'
        ? `${(req as any).workArrangement}${(req as any)?.hybridDays ? ` (${(req as any).hybridDays} days)` : ''}`
        : null;
      const location = [(req as any)?.location, arrangement].filter(Boolean).join(' · ') || null;
      const targetStart = (req as any)?.targetStartDate
        ? new Date((req as any).targetStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

      return {
        jobTitle: jd?.jobTitle ?? null,
        department: (req as any)?.department ?? null,
        reportsTo: (req as any)?.hiringManager ?? null,
        employmentType: (req as any)?.employmentType ?? 'Full-Time',
        location,
        bandMin: min,
        bandMax: max,
        suggestedSalary,
        targetStartDate: targetStart,
        financeConfirmed: !!(req as any)?.financeConfirmed,
      };
    }),

  // Preview the external offer letter (renders HTML; does not send or change stage).
  offerPreview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const offer = await buildOfferInput(ctx.db, input);
      return { html: renderOfferLetter(offer), jobTitle: offer.jobTitle };
    }),

  // Send the external offer letter via SendGrid and move the candidate to Offered.
  sendOffer: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildOfferInput(ctx.db, input);
      const jobTitle = offer.jobTitle;
      const letterHtml = renderOfferLetter(offer);

      // Email the letter (SendGrid).
      await emailOfferLetter({ to: candidate.email, firstName: candidate.firstName, jobTitle, letterHtml }).catch(() => {});

      // Advance to Offered (skip if already there / terminal).
      if (candidate.currentStage !== 'Offered' && candidate.currentStage !== 'Hired' && candidate.currentStage !== 'Rejected') {
        await ctx.db.update(candidates)
          .set({ currentStage: 'Offered', updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id,
          fromStage: candidate.currentStage,
          toStage: 'Offered',
          changedBy: ctx.user.id,
          reason: 'External offer letter sent',
        });
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'send_offer', 'candidates', { candidateId: input.id }).catch(() => {});
      return { ok: true, html: letterHtml };
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

  // Send CCAT + EPP assessment invitation via Criteria Corp
  sendAssessment: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      if (candidate.criteriaCorpId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assessment already sent — use refreshScores to pull latest results',
        });
      }

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      const result = await sendAssessment({
        candidateId: candidate.id,
        firstName:   candidate.firstName,
        lastName:    candidate.lastName,
        email:       candidate.email,
        jobTitle:    jd?.jobTitle ?? 'Unknown',
      });

      // Store the Criteria Corp applicant ID + mark assessment as sent
      await ctx.db.update(candidates)
        .set({
          criteriaCorpId:  result.criteriaApplicantId,
          assessmentSentAt: new Date(),
          updatedAt:        new Date(),
        })
        .where(eq(candidates.id, input.id));

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { ...result, candidateId: input.id };
    }),

  // Pull latest CCAT + EPP scores from Criteria Corp
  refreshScores: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!candidate.criteriaCorpId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No assessment sent yet — send assessment first',
        });
      }

      const scores = await getScores(candidate.criteriaCorpId);

      // Only update if assessment is actually completed
      if (scores.status !== 'completed') {
        return { status: scores.status, message: 'Assessment not yet completed', scores: null };
      }

      await ctx.db.update(candidates)
        .set({
          ccatScore:             scores.ccatScore ?? undefined,
          eppProfile:            scores.eppProfile ?? undefined,
          assessmentCompletedAt: scores.assessmentCompletedAt ? new Date(scores.assessmentCompletedAt) : undefined,
          updatedAt:             new Date(),
        })
        .where(eq(candidates.id, input.id));

      // Auto-run EPP analysis if we got an EPP profile back
      if (scores.eppProfile) {
        const jd = candidate.jdId
          ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
          : null;
        const requiredValues: string[] = Array.isArray(jd?.eppValues) ? jd.eppValues as string[] : [];

        const { analyzeEpp: runEpp } = await import('../services/eppAnalyzer.js');
        const analysis = runEpp(scores.eppProfile, requiredValues);

        await ctx.db.update(candidates)
          .set({ eppValuesMatchScore: analysis.score ?? undefined, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
      }

      // Automatic pass/fail decision on the CCAT score (SendGrid emails inside)
      await applyAssessmentDecision(ctx.db, input.id);

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { status: 'completed', scores };
    }),

  // Run EPP vs. values analysis for a candidate
  analyzeEpp: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!candidate.eppProfile) {
        return { skipped: true, reason: 'No EPP profile on record — run after Criteria Corp EPP results are received' };
      }

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      const requiredValues: string[] = Array.isArray(jd?.eppValues) ? jd.eppValues as string[] : [];
      const analysis = analyzeEpp(candidate.eppProfile as Record<string, number>, requiredValues);

      // Persist the score
      await ctx.db.update(candidates)
        .set({ eppValuesMatchScore: analysis.score ?? undefined, updatedAt: new Date() })
        .where(eq(candidates.id, input.id));

      // If in Work Sample stage and passes → advance to Values Review
      let stageAction: string | null = null;
      if (candidate.currentStage === 'Work Sample' && analysis.score !== null) {
        if (analysis.pass) {
          await ctx.db.update(candidates)
            .set({ currentStage: 'Values Review', updatedAt: new Date() })
            .where(eq(candidates.id, input.id));
          await ctx.db.insert(candidateStageHistory).values({
            candidateId: input.id,
            fromStage: 'Work Sample',
            toStage: 'Values Review',
            changedBy: ctx.user.id,
            reason: `EPP values match score ${analysis.score} met threshold of ${analysis.threshold}`,
          });
          stageAction = 'advanced_to_values_review';
        } else {
          stageAction = 'held_at_work_sample';
        }
      }

      return { analysis, stageAction };
    }),

  // Process interview transcript through AI and store feedback
  processInterviewFeedback: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      transcript: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      // Store transcript if provided
      if (input.transcript) {
        await ctx.db.update(candidates)
          .set({ interviewTranscript: input.transcript, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
      }

      const transcript = input.transcript ?? candidate.interviewTranscript ?? undefined;

      // Run AI feedback analysis
      const feedback = await analyzeInterviewTranscript({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: jd?.jobTitle ?? undefined,
        transcript,
        interviewQuestions: candidate.interviewQuestions as any ?? null,
        ccatScore: candidate.ccatScore,
        eppValuesMatchScore: candidate.eppValuesMatchScore,
        workSampleScore: candidate.workSampleScore,
        resumeReviewScore: candidate.resumeReviewScore,
        referenceCheckScore: candidate.referenceCheckScore,
      });

      // Store results
      await ctx.db.update(candidates)
        .set({
          interviewFeedbackHr: feedback.feedbackHr,
          interviewFeedbackCandidate: feedback.feedbackCandidate,
          interviewScore: feedback.interviewScore,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, input.id));

      // HR feedback email
      const hrSubject = `Interview debrief: ${candidate.firstName} ${candidate.lastName} — ${jd?.jobTitle ?? 'candidate'}`;
      await sendEmail({
        to: process.env.HR_EMAIL ?? 'jade.friedman@lsscorp.net',
        subject: hrSubject,
        templateId: 'interview_feedback_hr',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
            <h2>Interview Feedback — ${candidate.firstName} ${candidate.lastName}</h2>
            <p><strong>Role:</strong> ${jd?.jobTitle ?? 'Unknown'} &nbsp;|&nbsp; <strong>Score:</strong> ${feedback.interviewScore}/100</p>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;"/>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;">${feedback.feedbackHr}</pre>
          </div>
        `,
      });

      // Candidate feedback email (if in Interviewed stage)
      if (candidate.currentStage === 'Interviewed') {
        const candSubject = `Your interview feedback — ${jd?.jobTitle ?? 'Lightspeed Systems'}`;
        await sendEmail({
          to: candidate.email,
          subject: candSubject,
          templateId: 'interview_feedback_candidate',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
              <h2>Interview feedback</h2>
              <p>Hi ${candidate.firstName},</p>
              <p>Thank you for interviewing for <strong>${jd?.jobTitle ?? 'the position'}</strong>. Here's a summary of your interview feedback:</p>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:14px;line-height:1.6;">
                ${feedback.feedbackCandidate}
              </div>
              <p style="margin-top:20px;">We'll be in touch with next steps shortly.</p>
              <p>Best,<br/>Lightspeed Systems Recruiting</p>
            </div>
          `,
        });
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { feedback, candidateId: input.id };
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
