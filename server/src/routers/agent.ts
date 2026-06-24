// ============================================================
// AGENT ROUTER — propose-and-approve auto-fix harness (SC-034)
//
// The cross-module `debug-agent` skill (v1.6) runs in Cowork: it clones the
// repo, diagnoses an item, and — at high confidence — writes a fix on a
// branch and opens a PR. It NEVER merges. This router records runs and
// routes items to pm_review with the PR attached; a human merges the PR to
// apply the fix. There is no auto-resolve path here, by design.
//
// Conforms to Feedback/Agent Contract v1.0:
//   §3.2 run record, §3.4 diagnosis payload (JSON string in admin_notes),
//   §3.5 confidence (1–12 score + tier), §6 notifications, §7 guarantees.
//
// NOTE (scope): this is the in-app tRPC surface used by the admin cockpit
// and internal callers. The cross-app keyed HTTP API (Contract §4,
// x-api-key) that the Cowork skill calls is a follow-on piece — see the
// apply guide. Tables: agentRuns, feedback, notifications, users.
// ============================================================

import { z } from 'zod';
import { eq, desc, count } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { feedback, agentRuns } from '../db/schema/feedback.js';
import { users } from '../db/schema/core.js';
import { notifications } from '../db/schema/notifications.js';
import { requireAdmin } from '../services/permissions.js';

// Operational caps (Contract §7.3). Layer-4 config can override per app.
const MAX_ATTEMPTS_PER_ITEM = 3;
const MAX_ITEMS_PER_RUN = 30;

// ── Confidence (Contract §3.5): four signals 1–3, sum 4–12 ───
const signalSchema = z.object({
  score: z.number().int().min(1).max(3),
  rationale: z.string(),
});
const confidenceSchema = z.object({
  total: z.number().int().min(4).max(12),
  signals: z.object({
    root_cause_clarity: signalSchema,
    fix_scope: signalSchema,
    fix_category: signalSchema,
    precedent: signalSchema,
  }),
});
type Confidence = z.infer<typeof confidenceSchema>;

// Tier routing (Contract §3.5) + the documented override.
function computeTier(c: Confidence): 'Auto-Fix' | 'Assisted' | 'Manual' {
  const { total, signals } = c;
  // Override: score 9 with root-cause-clarity = 3 AND fix-scope >= 2 → Auto-Fix.
  if (total === 9 && signals.root_cause_clarity.score === 3 && signals.fix_scope.score >= 2) {
    return 'Auto-Fix';
  }
  if (total >= 10) return 'Auto-Fix';
  if (total >= 7) return 'Assisted';
  return 'Manual';
}

// Diagnosis payload (Contract §3.4) — stored as a JSON string in admin_notes
// AND as a native object in feedback.agent_diagnosis for convenient querying.
const diagnosisSchema = z.object({
  diagnosis_summary: z.string(),
  reclassification: z.any().nullable().optional(),
  confidence: confidenceSchema,
  pipeline: z.any().optional(),
  root_cause: z.string().optional(),
  fix_category: z.string().optional(),
  commit: z.string().optional(),
  deployment: z.any().optional(),
});

export const agentRouter = router({
  // ── Create a run (status: running) ─────────────────────────
  createRun: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().min(1).max(64),     // run slug, e.g. debug-agent-template-2026-06-03-2118
      model: z.string().optional(),
      triggeredBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db.insert(agentRuns).values({
        id: input.id,
        status: 'running',
        model: input.model ?? null,
        triggeredBy: input.triggeredBy ?? ctx.user!.name ?? ctx.user!.email,
        triggeredAt: new Date(),
      }).returning();
      return run;
    }),

  // ── Update run counts / status ─────────────────────────────
  updateRun: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().min(1).max(64),
      status: z.enum(['running', 'completed', 'failed', 'skipped']).optional(),
      itemsTotal: z.number().int().min(0).optional(),
      itemsFixed: z.number().int().min(0).optional(),
      itemsPmReview: z.number().int().min(0).optional(),
      itemsSkipped: z.number().int().min(0).optional(),
      itemsFailed: z.number().int().min(0).optional(),
      error: z.string().optional(),
      summary: z.string().optional(),
      runLog: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.agentRuns.findFirst({ where: eq(agentRuns.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const updates: Record<string, any> = {};
      for (const k of ['itemsTotal', 'itemsFixed', 'itemsPmReview', 'itemsSkipped', 'itemsFailed', 'error', 'summary'] as const) {
        if (input[k] !== undefined) updates[k] = input[k];
      }
      if (input.runLog !== undefined) updates.runLog = input.runLog;
      if (input.status) {
        updates.status = input.status;
        if (['completed', 'failed', 'skipped'].includes(input.status)) {
          updates.completedAt = new Date();
        }
      }

      const [run] = await ctx.db.update(agentRuns)
        .set(updates)
        .where(eq(agentRuns.id, input.id))
        .returning();
      return run;
    }),

  // ── Route an item to a human (propose-and-approve) ─────────
  // Attaches the diagnosis + (optional) PR and sets status=pm_review.
  // NEVER resolves — a human merges the PR to apply the fix.
  agentReview: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      feedbackId: z.string().uuid(),
      agentRunId: z.string().min(1).max(64),
      diagnosis: diagnosisSchema,
      prUrl: z.string().url().optional(),    // present when a fix was proposed on a branch
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.feedback.findFirst({ where: eq(feedback.id, input.feedbackId) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      // Attempt cap (Contract §7.3): reject the 4th attempt on one item.
      if ((existing.agentAttemptCount ?? 0) >= MAX_ATTEMPTS_PER_ITEM) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Attempt cap reached (${MAX_ATTEMPTS_PER_ITEM}) for feedback ${input.feedbackId}`,
        });
      }

      const tier = computeTier(input.diagnosis.confidence);
      // Propose-and-approve: a proposed fix (PR present) is "auto_fixed" awaiting
      // human merge; otherwise it's diagnosis-only. Either way the item lands at
      // pm_review and is NEVER auto-resolved here.
      const agentStatus = input.prUrl ? 'auto_fixed' : 'pm_review';

      const [updated] = await ctx.db.update(feedback)
        .set({
          status: 'pm_review',
          agentStatus,
          agentRunId: input.agentRunId,                            // run slug (varchar)
          agentDiagnosis: input.diagnosis as any,
          agentPrUrl: input.prUrl ?? null,
          adminNotes: JSON.stringify({ ...input.diagnosis, tier }),  // Contract §3.4 JSON-string shape
          agentAttemptCount: (existing.agentAttemptCount ?? 0) + 1,
          resolvedByType: 'agent',
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, input.feedbackId))
        .returning();

      // Notify admins (Contract §6: agent_resolution).
      const admins = await ctx.db.query.users.findMany({ where: eq(users.role, 'admin') });
      if (admins.length > 0) {
        await ctx.db.insert(notifications).values(
          admins.map((a) => ({
            userId: a.id,
            type: 'agent_resolution',
            message: `Agent proposed a fix for "${existing.title}" (${tier}${input.prUrl ? ', PR ready to review' : ', diagnosis only'}). Confidence ${input.diagnosis.confidence.total}/12.`,
            referenceId: existing.id,
            referenceType: 'feedback',
          })),
        ).onConflictDoNothing();
      }

      return { ...updated, tier };
    }),

  // ── List runs (admin cockpit) ──────────────────────────────
  list: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 25;
      const offset = (page - 1) * limit;

      const rows = await ctx.db
        .select()
        .from(agentRuns)
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit)
        .offset(offset);

      const totalRes = await ctx.db.select({ c: count() }).from(agentRuns);
      return { rows, total: totalRes[0].c };
    }),

  // ── One run + the items it touched ─────────────────────────
  getById: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.query.agentRuns.findFirst({ where: eq(agentRuns.id, input.id) });
      if (!run) throw new TRPCError({ code: 'NOT_FOUND' });

      const items = await ctx.db
        .select({
          id: feedback.id,
          title: feedback.title,
          type: feedback.type,
          status: feedback.status,
          agentStatus: feedback.agentStatus,
          agentPrUrl: feedback.agentPrUrl,
          agentAttemptCount: feedback.agentAttemptCount,
        })
        .from(feedback)
        .where(eq(feedback.agentRunId, input.id))
        .orderBy(desc(feedback.updatedAt));

      return { run, items };
    }),

  // ── Caps / mode (admin) ────────────────────────────────────
  config: protectedProcedure
    .use(requireAdmin)
    .query(async () => ({
      mode: 'propose-and-approve' as const,   // the agent never auto-merges/auto-resolves
      maxAttemptsPerItem: MAX_ATTEMPTS_PER_ITEM,
      maxItemsPerRun: MAX_ITEMS_PER_RUN,
      confidenceTiers: {
        autoFix: '10–12 (proposes a fix PR)',
        assisted: '7–9 (proposed fix + pm_review)',
        manual: '≤6 (diagnosis only → pm_review)',
        override: 'score 9 with root_cause_clarity=3 AND fix_scope≥2 → Auto-Fix',
      },
    })),
});
