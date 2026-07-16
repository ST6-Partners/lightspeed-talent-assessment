// ============================================================
// WORK SAMPLE ROUTER
//   • Public: a candidate opens an emailed link, reads the task,
//     and submits a response (typed answer + optional link).
//   • Protected: a recruiter sends the link, and can rescore.
//
// On submit, the response is auto-scored against the task's
// rubric (scoreAndStoreWorkSample, fire-and-forget). Admin
// scoring config sets a pass mark and an auto-reject toggle, so
// a failing candidate in an early stage can be rejected with no
// human review. A recruiter can also re-score or override.
// ============================================================

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { sql } from 'drizzle-orm';
import { resolveDeptWorkSample } from '../services/workSampleResolver.js';
import { emailInvitedToWorkSample } from '../services/email.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';
import { scoreAndStoreWorkSample } from '../services/workSampleScoring.js';
import { getWorkSampleScoringConfig, setWorkSampleScoringConfig } from '../services/workSampleConfig.js';
import { requireAdmin } from '../services/permissions.js';

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

      const resolved = await resolveDeptWorkSample(ctx.db, candidate);

      return {
        firstName: candidate.firstName,
        jobTitle: jd?.jobTitle ?? null,
        taskTitle: resolved?.title ?? null,
        instructions: resolved?.instructions ?? jd?.workSampleInstructions ?? null,
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

      // Auto-score against the task's rubric (advisory). Fire-and-forget so the
      // candidate's submit isn't blocked on the model call; errors are logged.
      void scoreAndStoreWorkSample(ctx.db, candidate.id)
        .catch((e) => console.error('[work-sample] auto-score failed:', e));

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

      // Resolve the library task so we know the delivery mode.
      const resolved = await resolveDeptWorkSample(ctx.db, candidate).catch(() => null);

      // LIVE WALKTHROUGH: don't email a homework link — create a "Work Sample
      // Walkthrough" interview round the candidate books like any other round.
      if (resolved?.deliveryMode === 'live_walkthrough') {
        const existing = await ctx.db.select().from(candidateInterviews)
          .where(eq(candidateInterviews.candidateId, candidate.id));
        let round = existing.find((r: any) => r.roundName === 'Work Sample Walkthrough');
        if (!round) {
          const maxRow = (await ctx.db.select({ m: sql<number>`coalesce(max(${candidateInterviews.sortOrder}), -1)` })
            .from(candidateInterviews).where(eq(candidateInterviews.candidateId, candidate.id)))[0];
          const [created] = await ctx.db.insert(candidateInterviews).values({
            candidateId: candidate.id,
            roundName: 'Work Sample Walkthrough',
            sortOrder: (maxRow?.m ?? -1) + 1,
          }).returning();
          round = created;
        }
        await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'update');
        trackActivity(ctx.db, ctx.user.id, 'send_work_sample', 'candidates', { candidateId: candidate.id, mode: 'live_walkthrough' }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));
        return { mode: 'live_walkthrough' as const, roundId: round.id, roundName: 'Work Sample Walkthrough' };
      }

      // TAKE-HOME (default): emailed submission link, auto-scored.
      const url = `${appBaseUrl()}/work-sample/${token}`;

      await emailInvitedToWorkSample({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        jobTitle: jd?.jobTitle,
        workSampleInstructions: resolved?.instructions ?? jd?.workSampleInstructions ?? undefined,
        workSampleUrl: url,
      });

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'send_work_sample', 'candidates', { candidateId: candidate.id, mode: 'take_home' }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));

      return { mode: 'take_home' as const, token, url };
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
      trackActivity(ctx.db, ctx.user.id, 'review_work_sample', 'candidates', { candidateId: id }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));
      return candidate;
    }),

  // ── PROTECTED: (re)run AI scoring against the task's current rubric ──
  // Handy after a work sample / rubric is finalized or changed.
  rescore: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!candidate.workSampleSubmission) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No work-sample submission to score yet.' });
      }
      const result = await scoreAndStoreWorkSample(ctx.db, input.id);
      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'score_work_sample', 'candidates', { candidateId: input.id }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));
      return result;
    }),

  // ── Scoring config: pass mark + auto-reject toggle ──
  getScoringConfig: protectedProcedure
    .query(async ({ ctx }) => getWorkSampleScoringConfig(ctx.db)),

  setScoringConfig: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      passThreshold: z.number().int().min(0).max(100),
      autoRejectEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setWorkSampleScoringConfig(ctx.db, input, ctx.user.id);
      return { ok: true };
    }),
});
