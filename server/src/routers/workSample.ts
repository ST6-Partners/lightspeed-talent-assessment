// ============================================================
// WORK SAMPLE ROUTER
//   • Public: a candidate opens an emailed link, reads the task,
//     and submits a response (typed answer + optional link).
//   • Protected: a recruiter sends the link and records a review.
//
// No AI auto-scoring yet — work-sample definitions + rubric are
// still TBD. Scoring here is manual (recruiter-entered).
// ============================================================

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { emailInvitedToWorkSample } from '../services/email.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

export const workSampleRouter = router({
  // ── PUBLIC: candidate opens the emailed link ───────────────
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.workSampleToken, input.token),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This work-sample link is invalid or has expired.' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      return {
        firstName: candidate.firstName,
        jobTitle: jd?.jobTitle ?? null,
        instructions: jd?.workSampleInstructions ?? null,
        alreadySubmitted: !!candidate.workSampleSubmittedAt,
        submittedAt: candidate.workSampleSubmittedAt,
      };
    }),

  // ── PUBLIC: candidate submits their response ───────────────
  submit: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      submission: z.string().min(1, 'Please enter your response.').max(50000),
      link: z.string().url('Enter a valid URL (or leave blank).').max(2000).optional().or(z.literal('')),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.workSampleToken, input.token),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This work-sample link is invalid or has expired.' });

      await ctx.db.update(candidates).set({
        workSampleSubmission: input.submission,
        workSampleLink: input.link ? input.link : null,
        workSampleSubmittedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));

      return { ok: true };
    }),

  // ── PROTECTED: recruiter sends the work-sample link ────────
  send: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const token = candidate.workSampleToken ?? randomUUID();
      if (!candidate.workSampleToken) {
        await ctx.db.update(candidates)
          .set({ workSampleToken: token, updatedAt: new Date() })
          .where(eq(candidates.id, candidate.id));
      }

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      const url = `${appBaseUrl()}/work-sample/${token}`;

      await emailInvitedToWorkSample({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        jobTitle: jd?.jobTitle,
        workSampleInstructions: jd?.workSampleInstructions ?? undefined,
        workSampleUrl: url,
      });

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'send_work_sample', 'candidates', { candidateId: candidate.id }).catch(() => {});

      return { token, url };
    }),

  // ── PROTECTED: recruiter records a manual review ───────────
  setReview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      score: z.number().int().min(0).max(100).nullable().optional(),
      notes: z.string().max(10000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [candidate] = await ctx.db.update(candidates)
        .set({
          ...(updates.score !== undefined ? { workSampleScore: updates.score } : {}),
          ...(updates.notes !== undefined ? { workSampleNotes: updates.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'review_work_sample', 'candidates', { candidateId: id }).catch(() => {});
      return candidate;
    }),
});
