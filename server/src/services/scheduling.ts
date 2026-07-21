// ============================================================
// SCHEDULING (service) — open self-booking for a candidate and email them
// the "pick a time" invite. Extracted from the scheduling router's `open`
// so non-request code (e.g. auto-booking a Work Sample Walkthrough the moment
// a candidate reaches that step) can trigger the same flow with no recruiter
// click. Idempotent: won't re-open (or re-email) an already-open booking
// unless forced.
// ============================================================
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { emailBookingInvite } from './email.js';
import { defaultSchedulingUrl } from './calendly.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

export async function openInterviewScheduling(
  db: any,
  candidateId: string,
  opts: { kind?: 'interview' | 'work_sample_walkthrough'; calendlyUrl?: string; force?: boolean } = {},
): Promise<{ opened: boolean; bookingUrl: string | null; reason?: string }> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return { opened: false, bookingUrl: null, reason: 'candidate not found' };

  const walkthrough = opts.kind === 'work_sample_walkthrough';
  const openedAt = walkthrough ? candidate.workSampleBookingOpenedAt : candidate.interviewBookingOpenedAt;
  const existingToken = walkthrough ? candidate.workSampleBookingToken : candidate.interviewBookingToken;

  // Don't re-open (and re-email) a booking that's already open unless forced.
  if (openedAt && !opts.force) {
    const existing = existingToken ? `${appBaseUrl()}/book-interview/${existingToken}` : null;
    return { opened: false, bookingUrl: existing, reason: 'already open' };
  }

  const bookingToken = existingToken ?? randomUUID();
  const schedulingUrl = opts.calendlyUrl ?? candidate.calendlySchedulingUrl ?? defaultSchedulingUrl();

  // Walkthrough bookings use their OWN token/opened-at so the Calendly webhook
  // can tell them apart from interview bookings (and not move the stage).
  await db.update(candidates).set({
    ...(walkthrough
      ? { workSampleBookingToken: bookingToken, workSampleBookingOpenedAt: new Date() }
      : { interviewBookingToken: bookingToken, interviewBookingOpenedAt: new Date() }),
    ...(schedulingUrl ? { calendlySchedulingUrl: schedulingUrl } : {}),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId));

  const bookingUrl = `${appBaseUrl()}/book-interview/${bookingToken}`;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;

  await emailBookingInvite({
    email: candidate.email,
    firstName: candidate.firstName,
    jobTitle: jd?.jobTitle ?? undefined,
    bookingUrl,
    kind: opts.kind ?? 'interview',
  }).catch((err: unknown) => console.error('[scheduling] booking invite failed:', err));

  return { opened: true, bookingUrl };
}
