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
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { emailWalkthroughAvailabilityNeeded } from './email.js';

export const WALKTHROUGH_ROUND_NAME = 'Work Sample Walkthrough';

export async function ensureWalkthroughRound(
  db: any,
  candidateId: string,
): Promise<{ roundId: string; roundName: string; created: boolean; bookingUrl?: string | null }> {
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

  // Recruiter-first scheduling: create the round but do NOT auto-email the
  // candidate a booking link (that used to dead-end on "not ready" before any
  // times existed). Instead, nudge the hiring team that they need to offer
  // availability windows. Fire-and-forget: a mail failure must not undo the round.
  try {
    const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
    if (cand) {
      const jd = cand.jdId ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, cand.jdId) }) : null;
      await emailWalkthroughAvailabilityNeeded({
        candidateName: `${cand.firstName ?? ''} ${cand.lastName ?? ''}`.trim(),
        jobTitle: jd?.jobTitle ?? undefined,
        candidateId,
      });
    }
  } catch (err) {
    console.error('[work-sample-walkthrough] availability-needed email failed:', err);
  }
  return { roundId: created.id, roundName: WALKTHROUGH_ROUND_NAME, created: true, bookingUrl: null };
}
