// ============================================================
// EEO ROUTER
//   • Public:  a candidate opens a voluntary self-ID survey link
//              and submits (or declines). Writes ONLY to eeo_responses.
//   • Protected: a recruiter generates a survey link for a candidate.
//   • Admin: the aggregate adverse-impact (four-fifths) audit + the
//            role picker that drives it.
//
// This router and services/adverseImpact.ts are the ONLY modules that
// read eeo_responses. No scoring / ranking / AI code touches it — that
// separation is the legal wall (self-ID data can never influence a
// hiring decision). The audit returns aggregates only.
// ============================================================

import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { eeoResponses } from '../db/schema/eeo.js';
import { requireAdmin } from '../services/permissions.js';
import { runAdverseImpactAudit } from '../services/adverseImpact.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

// Accepted answers (server-side allowlist). 'Declined' is the stored form
// of "prefer not to say". Anything else is rejected.
const SEX = ['Male', 'Female', 'Non-binary', 'Declined'] as const;
const RACE = [
  'Hispanic or Latino',
  'White',
  'Black or African American',
  'Asian',
  'Native American or Alaska Native',
  'Native Hawaiian or Pacific Islander',
  'Two or more races',
  'Declined',
] as const;
const VET = ['Protected veteran', 'Not a protected veteran', 'Declined'] as const;
const DIS = ['Yes', 'No', 'Declined'] as const;

export const eeoRouter = router({
  // ── PUBLIC: candidate opens the survey link ────────────────
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.eeoResponses.findFirst({
        where: eq(eeoResponses.token, input.token),
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'This survey link is invalid or has expired.' });
      // Do NOT return the candidate's stored answers; the survey is
      // write-mostly. Only whether it was already completed.
      return { alreadySubmitted: row.status !== 'invited', submittedAt: row.submittedAt };
    }),

  // ── PUBLIC: candidate submits (or declines) ────────────────
  submit: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      sex: z.enum(SEX).optional(),
      raceEthnicity: z.enum(RACE).optional(),
      veteranStatus: z.enum(VET).optional(),
      disabilityStatus: z.enum(DIS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.eeoResponses.findFirst({
        where: eq(eeoResponses.token, input.token),
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'This survey link is invalid or has expired.' });
      if (row.status !== 'invited') return { ok: true }; // idempotent — already answered

      // If they answered nothing, record a decline (still counts as a response).
      const answeredNothing = !input.sex && !input.raceEthnicity && !input.veteranStatus && !input.disabilityStatus;

      await ctx.db.update(eeoResponses).set({
        status: answeredNothing ? 'declined' : 'completed',
        sex: input.sex ?? null,
        raceEthnicity: input.raceEthnicity ?? null,
        veteranStatus: input.veteranStatus ?? null,
        disabilityStatus: input.disabilityStatus ?? null,
        submittedAt: new Date(),
      }).where(eq(eeoResponses.id, row.id));

      return { ok: true };
    }),

  // ── PROTECTED: recruiter generates (or re-fetches) a survey link ──
  invite: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.candidateId),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      let row = await ctx.db.query.eeoResponses.findFirst({
        where: eq(eeoResponses.candidateId, candidate.id),
      });
      if (!row) {
        const token = randomUUID();
        [row] = await ctx.db.insert(eeoResponses)
          .values({ candidateId: candidate.id, token })
          .returning();
      }
      return { token: row.token, url: `${appBaseUrl()}/eeo-survey/${row.token}` };
    }),

  // ── ADMIN: role picker (roles that have any assessment_gate decisions) ──
  auditRoles: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const res: any = await ctx.db.execute(sql`
        SELECT jd.id AS "jdId", jd.job_title AS "jobTitle", COUNT(DISTINCT dl.candidate_id)::int AS assessed
        FROM decision_log dl
        JOIN candidates c ON c.id = dl.candidate_id
        JOIN job_descriptions jd ON jd.id = c.jd_id
        WHERE dl.decision_type = 'assessment_gate'
        GROUP BY jd.id, jd.job_title
        ORDER BY assessed DESC, jd.job_title ASC
      `);
      return (res.rows ?? res) as { jdId: string; jobTitle: string; assessed: number }[];
    }),

  // ── ADMIN: the aggregate four-fifths audit for one role ────
  audit: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ jdId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const jd = await ctx.db.query.jobDescriptions.findFirst({
        where: eq(jobDescriptions.id, input.jdId),
      });
      const result = await runAdverseImpactAudit(ctx.db, input.jdId);
      return { ...result, jobTitle: jd?.jobTitle ?? 'Unknown role' };
    }),
});
