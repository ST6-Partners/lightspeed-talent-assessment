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
import { emailInterviewSchedulingInvite } from './email.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `${'https://'}${railway}`;
  return '';
}

// Kick off scheduling for the candidate's first not-yet-scheduled round: mint a
// booking token (idempotent — reuses an existing one) and email the candidate the
// link. No-op if there's no round yet (seedRoundsFromPlan should run first) or the
// round is already scheduled/completed.
export async function startInterviewRoundScheduling(db: any, candidateId: string): Promise<void> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return;

  const round = await db.query.candidateInterviews.findFirst({
    where: and(eq(candidateInterviews.candidateId, candidateId), eq(candidateInterviews.status, 'planned')),
    orderBy: (t: any) => [asc(t.sortOrder)],
  });
  if (!round) return; // rounds not seeded yet, or every round is already past 'planned'

  const token = (round as any).bookingToken ?? randomUUID();
  if (!(round as any).bookingToken) {
    await db.update(candidateInterviews)
      .set({ bookingToken: token, updatedAt: new Date() })
      .where(eq(candidateInterviews.id, round.id));
  }

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = (jd as any)?.jobTitle ?? undefined;
  const schedulingUrl = `${appBaseUrl()}/schedule-interview/${token}`;

  await emailInterviewSchedulingInvite({
    email: candidate.email,
    firstName: candidate.firstName,
    jobTitle,
    roundName: round.roundName,
    interviewerName: (round as any).interviewerName ?? undefined,
    schedulingUrl,
  }).catch((err) => console.error('[interviewScheduling] scheduling invite email failed:', err));

  console.log(`[interviewScheduling] scheduling invite sent to ${candidate.email} for round "${round.roundName}"`);
}
