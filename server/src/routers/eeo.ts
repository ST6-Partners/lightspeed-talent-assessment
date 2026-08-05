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
import { eq, sql, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { eeoResponses } from '../db/schema/eeo.js';
import { biasFlagDispositions, biasAlertLog } from '../db/schema/biasRemediation.js';
import { requireAdmin } from '../services/permissions.js';
import { runAdverseImpactAudit, simulateCutoffAudit } from '../services/adverseImpact.js';
import { ASSESSMENT_PASS_THRESHOLD } from '../services/assessmentDecision.js';
import { emailEeoSelfId } from '../services/email.js';

// Statuses an admin can set on a flag. Snoozed uses snoozeDays.
// ('validated_documented' was retired from the picker; ACK_STATUSES still
// recognizes it for any legacy row.)
const DISPOSITION_STATUS = [
  'open',
  'reviewed_no_change',
  'remediation_applied_monitoring',
  'snoozed',
] as const;

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
  // Recruiter-facing: invite STATUS only (never the responses). Powers the
  // "Send self-ID survey" affordance without exposing demographics.
  status: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.eeoResponses.findFirst({
        where: eq(eeoResponses.candidateId, input.candidateId),
      });
      return { status: (row?.status ?? 'not_sent') as string };
    }),

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
      const url = `${appBaseUrl()}/eeo-survey/${row.token}`;
      // Deliver the voluntary survey link (best-effort — never blocks).
      void emailEeoSelfId({
        firstName: candidate.firstName, email: candidate.email,
        jobTitle: undefined, surveyUrl: url,
      }).catch((err) => console.error('[eeo.invite] email failed:', err));
      return { token: row.token, url, status: row.status };
    }),

  // ── PROTECTED: recruiter manually marks the survey as taken ──
  // For candidates who completed the voluntary self-ID offline / on paper.
  // Records the completion STATUS only — no demographic answers are entered
  // here, so the legal wall (self-ID data never influences hiring) is intact.
  markCompleted: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.candidateId),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const existing = await ctx.db.query.eeoResponses.findFirst({
        where: eq(eeoResponses.candidateId, candidate.id),
      });
      if (existing) {
        await ctx.db.update(eeoResponses)
          .set({ status: 'completed', submittedAt: new Date() })
          .where(eq(eeoResponses.id, existing.id));
      } else {
        await ctx.db.insert(eeoResponses).values({
          candidateId: candidate.id, token: randomUUID(), status: 'completed', submittedAt: new Date(),
        });
      }
      return { ok: true };
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
      return { ...result, jobTitle: jd?.jobTitle ?? 'Unknown role', baseCutoff: ASSESSMENT_PASS_THRESHOLD };
    }),

  // ── ADMIN: cutoff what-if (Remediate-this-flag) ────────────
  // Re-runs the four-fifths audit at a chosen CCAT cutoff over the same
  // population, plus a "who this adds" readout. Aggregate only. Read-only:
  // this NEVER changes the live gate — it only previews a change.
  simulateCutoff: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ jdId: z.string().uuid(), cutoff: z.number().int().min(0).max(50) }))
    .query(async ({ ctx, input }) => {
      return simulateCutoffAudit(ctx.db, input.jdId, input.cutoff, ASSESSMENT_PASS_THRESHOLD);
    }),

  // ── ADMIN: read a role's flag disposition ──────────────────
  getDisposition: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ jdId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.biasFlagDispositions.findFirst({
        where: eq(biasFlagDispositions.jdId, input.jdId),
      });
      return row ?? null;
    }),

  // ── ADMIN: set/clear a role's flag disposition ─────────────
  // Upsert by role. Acknowledged statuses tell the hourly bias-alert job to
  // stop re-raising the flag; 'snoozed' quiets it until snoozeDays elapse.
  setDisposition: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      jdId: z.string().uuid(),
      status: z.enum(DISPOSITION_STATUS),
      note: z.string().max(2000).optional(),
      snoozeDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const snoozeUntil = input.status === 'snoozed' && input.snoozeDays
        ? new Date(Date.now() + input.snoozeDays * 24 * 3600 * 1000)
        : null;
      const now = new Date();
      const values = {
        jdId: input.jdId,
        status: input.status,
        note: input.note ?? null,
        snoozeUntil,
        decidedBy: ctx.user.id,
        decidedByName: ctx.user.name ?? ctx.user.email ?? null,
        updatedAt: now,
      };
      await ctx.db.insert(biasFlagDispositions)
        .values(values)
        .onConflictDoUpdate({ target: biasFlagDispositions.jdId, set: values });
      return { ok: true };
    }),

  // ── ADMIN: one-line-per-role concern summary (Bias tab triage list) ──
  // Runs the four-fifths audit for every role with assessment-gate decisions
  // and returns a compact roll-up: flagged concerns + current disposition.
  // Powers the summarized list at the top of the Bias tab; a row expands to
  // the full audit. Aggregate only.
  flagSummary: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const rolesRes: any = await ctx.db.execute(sql`
        SELECT jd.id AS "jdId", jd.job_title AS "jobTitle", COUNT(DISTINCT dl.candidate_id)::int AS assessed
        FROM decision_log dl
        JOIN candidates c ON c.id = dl.candidate_id
        JOIN job_descriptions jd ON jd.id = c.jd_id
        WHERE dl.decision_type = 'assessment_gate'
        GROUP BY jd.id, jd.job_title
        ORDER BY jd.job_title ASC
      `);
      const roles = (rolesRes.rows ?? rolesRes) as { jdId: string; jobTitle: string; assessed: number }[];

      const dispRows = await ctx.db.select().from(biasFlagDispositions);
      const dispByJd = new Map(dispRows.map((d) => [d.jdId, d]));

      const summaries = await Promise.all(roles.map(async (role) => {
        const audit = await runAdverseImpactAudit(ctx.db, role.jdId);
        const flags: { dimension: string; group: string; passRate: number | null; ratio: number | null }[] = [];
        for (const dim of audit.dimensions) {
          for (const g of dim.groups) {
            if (g.status === 'flagged') flags.push({ dimension: dim.label, group: g.group, passRate: g.passRate, ratio: g.ratio });
          }
        }
        const d = dispByJd.get(role.jdId);
        return {
          jdId: role.jdId,
          jobTitle: role.jobTitle,
          assessed: audit.assessed,
          responseRate: audit.responseRate,
          lowResponse: audit.responseRate < 50,
          flaggedCount: flags.length,
          flags,
          dispositionStatus: d?.status ?? null,
          snoozeUntil: d?.snoozeUntil ?? null,
        };
      }));

      // Only surface ACTUAL, RELIABLE concerns: a real flag backed by an
      // adequate survey response rate. Roles with no flag, or with too few
      // survey responses to judge (lowResponse), are noise on a concerns tab
      // and are excluded. `evaluated` reports how many roles were checked so
      // the UI can say what was screened out.
      const concerns = summaries
        .filter((s) => s.flaggedCount > 0 && !s.lowResponse)
        .sort((a, b) => b.flaggedCount - a.flaggedCount || a.jobTitle.localeCompare(b.jobTitle));
      return { concerns, evaluated: summaries.length };
    }),

  // ── ADMIN: append-only history of past bias alerts (Bias tab footer) ──
  // The durable record. Unlike bell notifications (deletable per user), these
  // rows are never removed from the UI. Newest first.
  alertHistory: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      return ctx.db.select().from(biasAlertLog).orderBy(desc(biasAlertLog.createdAt)).limit(200);
    }),
});
