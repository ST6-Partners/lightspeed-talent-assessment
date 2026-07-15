// ============================================================
// DECISIONS ROUTER — Phase 2 (decision provenance & transparency)
//
// Read-only access to the decision_log: the per-candidate trail of
// how each AI/rule/human decision was made (model + prompt version +
// inputs + plain-language reason). Powers a "Decision history" panel
// on the candidate and answers auditor / candidate "why?" questions.
// ============================================================

import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { decisionLog, decisionLogFailures } from '../db/schema/decisions.js';
import { PROMPTS } from '../services/prompts.js';
import { requireAdmin } from '../services/permissions.js';

export const decisionsRouter = router({
  // Full provenance trail for one candidate, newest first.
  listByCandidate: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(decisionLog)
        .where(eq(decisionLog.candidateId, input.candidateId))
        .orderBy(desc(decisionLog.createdAt));
    }),

  // The current prompt registry (id + version + purpose + changelog),
  // so the UI / an auditor can see which prompt versions are live.
  promptRegistry: protectedProcedure.query(async () => {
    return Object.values(PROMPTS);
  }),

  // How many decision writes failed and were dead-lettered (not yet replayed).
  // Observability for the safety net — a non-zero count means the provenance
  // log (and anything that reads it, e.g. the adverse-impact audit) has gaps.
  failureCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(decisionLogFailures)
      .where(eq(decisionLogFailures.resolved, false))) as any;
    return { unresolved: row?.n ?? 0 };
  }),

  // Admin: replay dead-lettered decision writes back into decision_log. Each row
  // that re-inserts cleanly is marked resolved; the rest stay for the next retry.
  retryFailures: protectedProcedure
    .use(requireAdmin)
    .mutation(async ({ ctx }) => {
      const pending = await ctx.db
        .select()
        .from(decisionLogFailures)
        .where(eq(decisionLogFailures.resolved, false))
        .orderBy(desc(decisionLogFailures.createdAt))
        .limit(500);
      let retried = 0;
      for (const row of pending as any[]) {
        try {
          if (row.payload) await ctx.db.insert(decisionLog).values(row.payload);
          await ctx.db.update(decisionLogFailures)
            .set({ resolved: true, resolvedAt: new Date() })
            .where(eq(decisionLogFailures.id, row.id));
          retried++;
        } catch (err) {
          console.error('[decisions.retryFailures] replay still failing for', row.id, err);
        }
      }
      const [rem] = (await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(decisionLogFailures)
        .where(eq(decisionLogFailures.resolved, false))) as any;
      return { retried, remaining: rem?.n ?? 0 };
    }),
});
