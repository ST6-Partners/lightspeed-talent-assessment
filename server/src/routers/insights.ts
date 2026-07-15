// ============================================================
// INSIGHTS ROUTER — Hiring pipeline analytics
// All metrics computed server-side from existing hiring tables.
// ============================================================

import { sql, eq, desc, count, isNotNull } from 'drizzle-orm';
import { CANDIDATE_STAGES } from '../domain/stages.js';
import { router, protectedProcedure } from '../trpc.js';
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { db } from '../db.js';

export const insightsRouter = router({
  // Full analytics payload — one call loads the entire Insights page
  summary: protectedProcedure.query(async ({ ctx }) => {
    const pool = (ctx.db as any).session?.client ?? (await import('../db.js')).pool;

    // ── Stage funnel ──────────────────────────────────────
    const stageFunnel = await ctx.db
      .select({
        stage: candidates.currentStage,
        count: count(),
      })
      .from(candidates)
      .groupBy(candidates.currentStage);

    // ── Rejection reasons ──────────────────────────────────
    const rejectionReasons = await ctx.db
      .select({
        reason: candidates.rejectionReason,
        count: count(),
      })
      .from(candidates)
      .where(eq(candidates.currentStage, 'Rejected'))
      .groupBy(candidates.rejectionReason);

    // ── Source mix ─────────────────────────────────────────
    const sourceMix = await ctx.db
      .select({
        source: candidates.source,
        count: count(),
      })
      .from(candidates)
      .groupBy(candidates.source);

    // ── CCAT stats ─────────────────────────────────────────
    const ccatRows = await ctx.db
      .select({ score: candidates.ccatScore })
      .from(candidates)
      .where(isNotNull(candidates.ccatScore));

    const ccatScores = ccatRows.map(r => r.score!);
    const ccatStats = ccatScores.length > 0 ? {
      total: ccatScores.length,
      avg: Math.round(ccatScores.reduce((a, b) => a + b, 0) / ccatScores.length),
      min: Math.min(...ccatScores),
      max: Math.max(...ccatScores),
      passed: ccatScores.filter(s => s >= 30).length,
      failed: ccatScores.filter(s => s < 30).length,
    } : null;

    // ── EPP stats ──────────────────────────────────────────
    const eppRows = await ctx.db
      .select({ score: candidates.eppValuesMatchScore })
      .from(candidates)
      .where(isNotNull(candidates.eppValuesMatchScore));

    const eppScores = eppRows.map(r => r.score!);
    const eppStats = eppScores.length > 0 ? {
      total: eppScores.length,
      avg: Math.round(eppScores.reduce((a, b) => a + b, 0) / eppScores.length),
      passed: eppScores.filter(s => s >= 70).length,
      failed: eppScores.filter(s => s < 70).length,
    } : null;

    // ── Interview scores ───────────────────────────────────
    const interviewRows = await ctx.db
      .select({ score: candidates.interviewScore })
      .from(candidates)
      .where(isNotNull(candidates.interviewScore));

    const interviewScores = interviewRows.map(r => r.score!);
    const interviewStats = interviewScores.length > 0 ? {
      total: interviewScores.length,
      avg: Math.round(interviewScores.reduce((a, b) => a + b, 0) / interviewScores.length),
    } : null;

    // ── Stage-to-stage conversions ─────────────────────────
    const conversions = await ctx.db
      .select({
        from: candidateStageHistory.fromStage,
        to: candidateStageHistory.toStage,
        count: count(),
      })
      .from(candidateStageHistory)
      .groupBy(candidateStageHistory.fromStage, candidateStageHistory.toStage);

    // ── Avg days per stage (from stage history) ────────────
    // Uses raw SQL since Drizzle doesn't have a built-in EXTRACT interval helper
    const timeInStageRows = await ctx.db.execute(sql`
      WITH stage_windows AS (
        SELECT
          candidate_id,
          to_stage AS stage,
          created_at AS entered_at,
          LEAD(created_at) OVER (PARTITION BY candidate_id ORDER BY created_at) AS exited_at
        FROM candidate_stage_history
      )
      SELECT
        stage,
        ROUND(AVG(EXTRACT(EPOCH FROM (exited_at - entered_at)) / 86400)::numeric, 1) AS avg_days
      FROM stage_windows
      WHERE exited_at IS NOT NULL
        AND stage NOT IN ('Rejected', 'Hired', 'Offered', 'Not Selected')
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'Applied'             THEN 1
        WHEN 'Assessment'          THEN 2
        WHEN 'Work Sample'         THEN 3
        WHEN 'Values Review'       THEN 4
        WHEN 'Phone Screen'        THEN 5
        WHEN 'Interview Scheduled' THEN 6
        WHEN 'Interviewed'         THEN 7
        ELSE 8 END
    `);

    // ── Weekly application volume (last 12 weeks) ──────────
    const weeklyVolumeRows = await ctx.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('week', created_at), 'MM/DD') AS week,
        COUNT(*) AS count
      FROM candidates
      WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY DATE_TRUNC('week', created_at)
    `);

    // ── Summary totals ─────────────────────────────────────
    const totalApplicants = stageFunnel.reduce((sum, r) => sum + Number(r.count), 0);
    const hired = stageFunnel.find(r => r.stage === 'Hired');
    const offered = stageFunnel.find(r => r.stage === 'Offered');

    const STAGE_ORDER = CANDIDATE_STAGES;

    return {
      funnel: STAGE_ORDER.map(stage => ({
        stage,
        count: Number(stageFunnel.find(r => r.stage === stage)?.count ?? 0),
      })),
      rejectionReasons: rejectionReasons.map(r => ({
        reason: r.reason ?? 'Not specified',
        count: Number(r.count),
      })).sort((a, b) => b.count - a.count),
      sourceMix: sourceMix.map(r => ({
        source: r.source ?? 'Unknown',
        count: Number(r.count),
      })).sort((a, b) => b.count - a.count),
      timeInStage: ((timeInStageRows as any).rows as any[]).map(r => ({
        stage: r.stage as string,
        avgDays: parseFloat(r.avg_days as string) || 0,
      })),
      weeklyVolume: ((weeklyVolumeRows as any).rows as any[]).map(r => ({
        week: r.week as string,
        count: Number(r.count),
      })),
      ccat: ccatStats,
      epp: eppStats,
      interview: interviewStats,
      summary: {
        totalApplicants,
        totalHired: Number(hired?.count ?? 0),
        totalOffered: Number(offered?.count ?? 0),
        offerRate: totalApplicants > 0
          ? ((Number(offered?.count ?? 0) / totalApplicants) * 100).toFixed(1)
          : '0.0',
        hireRate: totalApplicants > 0
          ? ((Number(hired?.count ?? 0) / totalApplicants) * 100).toFixed(1)
          : '0.0',
      },
      conversions: conversions.map(r => ({
        from: r.from,
        to: r.to,
        count: Number(r.count),
      })),
    };
  }),
});
