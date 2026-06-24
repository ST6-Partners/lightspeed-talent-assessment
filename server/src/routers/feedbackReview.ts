// ============================================================
// FEEDBACK REVIEW ROUTER — pre-submit AI "front desk" (Contract v1.0 §5)
//
// T1 UPDATE: the review logic now lives in
//   server/src/services/feedbackReviewService.ts
// so the in-app tRPC surface (this file) and the keyed HTTP API
// (server/src/http/feedbackApi.ts) share ONE implementation. This file
// is the thin tRPC wrapper; it replaces the 06-03 Stage A version.
//
// Tables: feedbackReviewAttempts, feedback, faq_entries, design_knowledge.
// ============================================================

import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { feedbackReviewAttempts } from '../db/schema/feedback.js';
import { requireAdmin } from '../services/permissions.js';
import { runFeedbackReview, REVIEW_MODEL } from '../services/feedbackReviewService.js';

export const feedbackReviewRouter = router({
  // ── Pre-submit AI review (Contract v1.0 §5) ────────────────
  // Does NOT save feedback. Delegates to the shared service, attributing the
  // review attempt to the current user.
  review: protectedProcedure
    .input(z.object({
      type: z.string().min(1),
      title: z.string().min(1).max(500),
      description: z.string().optional().default(''),
      severity: z.string().optional(),
      priority: z.string().optional(),
      screenPath: z.string().optional(),
      contextSnapshot: z.record(z.string(), z.any()).optional(),  // zod v4: explicit key type
    }))
    .mutation(async ({ ctx, input }) => {
      return runFeedbackReview(ctx.db, input, { userId: ctx.user!.id });
    }),

  // ── User accepted the AI outcome and chose NOT to file ──────
  dismiss: protectedProcedure
    .input(z.object({
      reviewAttemptId: z.string().uuid(),
      reason: z.enum(['answered', 'duplicate', 'abandoned']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const attempt = await ctx.db.query.feedbackReviewAttempts.findFirst({
        where: eq(feedbackReviewAttempts.id, input.reviewAttemptId),
      });
      if (!attempt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (attempt.userId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN' });

      const [updated] = await ctx.db.update(feedbackReviewAttempts)
        .set({ outcomeResolvedAt: new Date(), shouldHaveBeenFiled: false })
        .where(eq(feedbackReviewAttempts.id, input.reviewAttemptId))
        .returning();
      return updated;
    }),

  // ── Admin: review configuration + deflection stats ─────────
  config: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const totalRes = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(feedbackReviewAttempts);
      const deflectedRes = await ctx.db
        .select({ c: sql<number>`count(*)` })
        .from(feedbackReviewAttempts)
        .where(sql`resulted_in_feedback_id IS NULL`);

      const total = Number(totalRes[0]?.c ?? 0);
      const deflected = Number(deflectedRes[0]?.c ?? 0);

      return {
        enabled: !!process.env.ANTHROPIC_API_KEY,
        model: REVIEW_MODEL,
        deflection: {
          totalReviews: total,
          deflected,
          rate: total > 0 ? Math.round((deflected / total) * 100) : 0,
        },
      };
    }),
});
