// ============================================================
// RANKING ROUTER — advisory candidate ranking for a role.
// getForRole returns the live top 25 (best first, in-pool only).
// rankRole rebuilds the whole ranking on demand. No stage changes here.
// ============================================================
import { z } from 'zod';
import { eq, and, desc, notInArray, sql } from 'drizzle-orm';
import { NOT_RANKABLE_STAGES, sqlStageList } from '../domain/stages.js';
import { router, protectedProcedure } from '../trpc.js';
import { candidateRankings, rankingRuns, candidates } from '../db/schema/hiring.js';
import { rankRoleCandidates } from '../services/candidateRanking.js';

const DROPPED = NOT_RANKABLE_STAGES;

export const rankingRouter = router({
  rankRole: protectedProcedure
    .input(z.object({ jdId: z.string().uuid(), criteriaOverride: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return rankRoleCandidates(ctx.db, input.jdId, ctx.user.id, input.criteriaOverride ?? null);
    }),

  getForRole: protectedProcedure
    .input(z.object({ jdId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }))
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
          hadResume: candidateRankings.hadResume,
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
        .limit(input.limit ?? 25);

      const [{ n }] = (await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(candidateRankings)
        .innerJoin(candidates, eq(candidates.id, candidateRankings.candidateId))
        .where(inPool)) as any;

      // Candidates in the pool that don't have a ranking yet (being scored).
      // Only surfaced once a role is actively ranked (a run exists).
      let pending: any[] = [];
      if (run) {
        pending = (((await ctx.db.execute(sql`
          SELECT c.id AS "candidateId", c.first_name AS "firstName", c.last_name AS "lastName",
                 c.email AS email, c.current_stage AS "currentStage"
          FROM candidates c
          WHERE c.jd_id = ${input.jdId}
            AND c.current_stage NOT IN (${sql.raw(sqlStageList(NOT_RANKABLE_STAGES))})
            AND c.id NOT IN (SELECT candidate_id FROM candidate_rankings WHERE jd_id = ${input.jdId})
          ORDER BY c.created_at DESC
          LIMIT 25
        `)) as any).rows) as any[];
      }

      return {
        run: run ?? null,
        total: n ?? rankings.length,
        rankings,
        pending,
      };
    }),

  // A single candidate's latest ranking read — used by the Review queue so a
  // reviewer sees the same AI recommendation/strengths/probes as the ranking.
  getForCandidate: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          recommendation: candidateRankings.recommendation,
          strengths: candidateRankings.strengths,
          concerns: candidateRankings.concerns,
          hadResume: candidateRankings.hadResume,
          createdAt: candidateRankings.createdAt,
        })
        .from(candidateRankings)
        .where(eq(candidateRankings.candidateId, input.candidateId))
        .orderBy(desc(candidateRankings.createdAt))
        .limit(1);
      return row ?? null;
    }),
});
