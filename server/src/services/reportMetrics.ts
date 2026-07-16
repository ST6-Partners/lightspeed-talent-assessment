// ============================================================
// PERIOD METRICS — headline hiring numbers for a [from,to] window.
// Used by the scheduled weekly/quarterly report emails (and available
// for any date-range summary). Kept intentionally compact: the email is
// a digest, not the full dashboard.
// ============================================================
import { and, gte, lte, eq, count, sql } from 'drizzle-orm';
import { candidates, candidateStageHistory, jobRequisitions } from '../db/schema/hiring.js';
import { candidateInterviews } from '../db/schema/interviews.js';

export interface PeriodMetrics {
  applied: number;
  advanced: number;
  interviewsScheduled: number;
  offered: number;
  hired: number;
  rejected: number;
  openReqs: number;
}

export async function buildPeriodMetrics(db: any, fromISO: string, toISO: string): Promise<PeriodMetrics> {
  const from = new Date(fromISO);
  const to = new Date(toISO);

  const appliedRows = await db.select({ c: count() }).from(candidates)
    .where(and(gte(candidates.createdAt, from), lte(candidates.createdAt, to)));

  const inWindow = and(gte(candidateStageHistory.createdAt, from), lte(candidateStageHistory.createdAt, to));
  const advancedRows = await db.select({ c: count() }).from(candidateStageHistory)
    .where(and(inWindow, sql`${candidateStageHistory.toStage} NOT IN ('Rejected','Not Selected')`));
  const offeredRows = await db.select({ c: count() }).from(candidateStageHistory)
    .where(and(inWindow, eq(candidateStageHistory.toStage, 'Offered')));
  const hiredRows = await db.select({ c: count() }).from(candidateStageHistory)
    .where(and(inWindow, eq(candidateStageHistory.toStage, 'Hired')));
  const rejectedRows = await db.select({ c: count() }).from(candidateStageHistory)
    .where(and(inWindow, eq(candidateStageHistory.toStage, 'Rejected')));

  const schedRows = await db.select({ c: count() }).from(candidateInterviews)
    .where(and(gte(candidateInterviews.scheduledAt, from), lte(candidateInterviews.scheduledAt, to)));

  const openReqRows = await db.select({ c: count() }).from(jobRequisitions)
    .where(eq(jobRequisitions.status, 'Open'));

  const n = (r: any[]) => Number(r?.[0]?.c ?? 0);
  return {
    applied: n(appliedRows),
    advanced: n(advancedRows),
    interviewsScheduled: n(schedRows),
    offered: n(offeredRows),
    hired: n(hiredRows),
    rejected: n(rejectedRows),
    openReqs: n(openReqRows),
  };
}
