// ============================================================
// RANKING ROUTER — advisory candidate ranking for a role.
// getForRole returns the live top 15 (best first, in-pool only).
// rankRole rebuilds the whole ranking on demand. No stage changes here.
// ============================================================
import { z } from 'zod';
import { eq, and, desc, notInArray, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { candidateRankings, rankingRuns, candidates } from '../db/schema/hiring.js';
import { rankRoleCandidates } from '../services/candidateRanking.js';

const DROPPED = ['Rejected', 'Hired', 'Offered'] as const;

export const rankingRouter = router({
  rankRole: protectedProcedure
    .input(z.object({ jdId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return rankRoleCandidates(ctx.db, input.jdId, ctx.user.id);
    }),

  getForRole: protectedProcedure
    .input(z.object({ jdId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(rankingRuns)
        .where(eq(rankingRuns.jdId, input.jdId))
        .orderBy(desc(rankingRuns.createdAt))
        .limit(1);

      const inPool = and(
        eq(candidateRankings.jdId, input.jdId),
        notInArray(candidates.currentStage, DROPPED as any),
      );

      const rankings = await ctx.db
        .select({
          id: candidateRankings.id,
          candidateId: candidateRankings.candidateId,
          recommendation: candidateRankings.recommendation,
          strengths: candidateRankings.strengths,
          concerns: candidateRankings.concerns,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email,
          currentStage: candidates.currentStage,
        })
        .from(candidateRankings)
        .innerJoin(candidates, eq(candidates.id, candidateRankings.candidateId))
        .where(inPool)
        .orderBy(desc(candidateRankings.sortScore))
        .limit(15);

      const [{ n }] = (await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(candidateRankings)
        .innerJoin(candidates, eq(candidates.id, candidateRankings.candidateId))
        .where(inPool)) as any;

      return {
        run: run ?? null,
        total: n ?? rankings.length,
        rankings,
      };
    }),
});
