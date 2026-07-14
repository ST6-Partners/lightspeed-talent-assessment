// ============================================================
// DECISIONS ROUTER — Phase 2 (decision provenance & transparency)
//
// Read-only access to the decision_log: the per-candidate trail of
// how each AI/rule/human decision was made (model + prompt version +
// inputs + plain-language reason). Powers a "Decision history" panel
// on the candidate and answers auditor / candidate "why?" questions.
// ============================================================

import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { decisionLog } from '../db/schema/decisions.js';
import { PROMPTS } from '../services/prompts.js';

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
});
