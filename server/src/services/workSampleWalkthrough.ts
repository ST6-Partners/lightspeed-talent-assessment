// ============================================================
// WORK SAMPLE — LIVE WALKTHROUGH
// When a role's work sample is delivered as a live walkthrough (Zoom)
// instead of a take-home submission, the candidate books a "Work Sample
// Walkthrough" interview round and walks the panel through the task live
// (human-scored on that round). This helper creates that round idempotently
// so both the manual "send work sample" action and the automatic stage
// advance produce the same thing.
// ============================================================
import { eq, sql } from 'drizzle-orm';
import { candidateInterviews } from '../db/schema/interviews.js';

export const WALKTHROUGH_ROUND_NAME = 'Work Sample Walkthrough';

export async function ensureWalkthroughRound(
  db: any,
  candidateId: string,
): Promise<{ roundId: string; roundName: string; created: boolean }> {
  const existing = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId));
  const found = existing.find((r: any) => r.roundName === WALKTHROUGH_ROUND_NAME);
  if (found) return { roundId: found.id, roundName: WALKTHROUGH_ROUND_NAME, created: false };

  const maxRow = (await db.select({ m: sql<number>`coalesce(max(${candidateInterviews.sortOrder}), -1)` })
    .from(candidateInterviews).where(eq(candidateInterviews.candidateId, candidateId)))[0];
  const [created] = await db.insert(candidateInterviews).values({
    candidateId,
    roundName: WALKTHROUGH_ROUND_NAME,
    sortOrder: (maxRow?.m ?? -1) + 1,
  }).returning();
  return { roundId: created.id, roundName: WALKTHROUGH_ROUND_NAME, created: true };
}
