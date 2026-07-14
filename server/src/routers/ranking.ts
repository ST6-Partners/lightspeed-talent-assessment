// ============================================================
// RANKING ROUTER — advisory candidate ranking for a role.
// rankRole (re)builds the ranking; getForRole reads it back joined
// with candidate basics for the ranked view. No stage changes here.
// ============================================================
import { z } from 'zod';
import { eq, asc, desc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { candidateRankings, rankingRuns, candidates } from '../db/schema/hiring.js';
import { rankRoleCandidates } from '../services/candidateRanking.js';

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
      if (!run) return { run: null, rankings: [] as any[] };
      const rankings = await ctx.db
        .select({
          id: candidateRankings.id,
          candidateId: candidateRankings.candidateId,
          rank: candidateRankings.rank,
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
        .where(eq(candidateRankings.jdId, input.jdId))
        .orderBy(asc(candidateRankings.rank));
      return { run, rankings };
    }),
});
