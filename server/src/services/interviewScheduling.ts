// ============================================================
// INTERVIEW-ROUND SCHEDULING (candidate picks from the interviewer's slots)
//
// When a candidate reaches Interview Scheduled we do NOT claim the interview is
// already booked (it isn't yet). Instead we mint a booking token on the first
// not-yet-scheduled round and email the CANDIDATE a "Schedule your interview"
// link. That link (see scheduling.getInterviewRoundBookingContext /
// confirmInterviewRoundSlot) shows the assigned interviewer's already-submitted
// availability windows (interviewerAvailability, collected at intake approval —
// see scheduling.submitInterviewerAvailability) as discrete slots to pick from.
// Mirrors the phone-screen recruiter-first pattern (services/phoneScreen.ts),
// just sourcing the "who submitted availability" step from intake instead of
// asking again per-candidate.
// ============================================================

import { eq, and, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { emailInterviewSchedulingInviteAll } from './email.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `${'https://'}${railway}`;
  return '';
}

// Kick off ALL-ROUNDS scheduling for the candidate: mint a single booking token
// (the entry token, stored on the candidate's first round — idempotent) and email
// the candidate ONE link from which they pick a time for every round. The link
// resolves the candidate from the token, then loads all their rounds (see
// scheduling.getInterviewBookingContext / confirmInterviewBooking). No-op if there
// are no rounds yet (seedRoundsFromPlan should run first).
export async function startInterviewRoundScheduling(db: any, candidateId: string): Promise<void> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return;

  const rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  if (!rounds.length) return; // rounds not seeded yet

  // Only invite if there's at least one round still to schedule.
  const unscheduled = rounds.filter((r: any) => !r.scheduledAt);
  if (!unscheduled.length) return;

  // The entry token lives on the first round; any round's token resolves the
  // candidate, so one token covers the whole set.
  const entry = rounds[0];
  const token = (entry as any).bookingToken ?? randomUUID();
  if (!(entry as any).bookingToken) {
    await db.update(candidateInterviews)
      .set({ bookingToken: token, updatedAt: new Date() })
      .where(eq(candidateInterviews.id, entry.id));
  }

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = (jd as any)?.jobTitle ?? undefined;
  const schedulingUrl = `${appBaseUrl()}/schedule-interview/${token}`;

  await emailInterviewSchedulingInviteAll({
    email: candidate.email,
    firstName: candidate.firstName,
    jobTitle,
    roundCount: rounds.length,
    schedulingUrl,
  }).catch((err) => console.error('[interviewScheduling] scheduling invite email failed:', err));

  console.log(`[interviewScheduling] all-rounds scheduling invite sent to ${candidate.email} (${rounds.length} round(s))`);
}
