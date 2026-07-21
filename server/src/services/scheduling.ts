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

  // Don't re-open (and re-email) a booking that's already open unless forced.
  if (candidate.interviewBookingOpenedAt && !opts.force) {
    const existing = candidate.interviewBookingToken ? `${appBaseUrl()}/book-interview/${candidate.interviewBookingToken}` : null;
    return { opened: false, bookingUrl: existing, reason: 'already open' };
  }

  const bookingToken = candidate.interviewBookingToken ?? randomUUID();
  const schedulingUrl = opts.calendlyUrl ?? candidate.calendlySchedulingUrl ?? defaultSchedulingUrl();

  await db.update(candidates).set({
    interviewBookingToken: bookingToken,
    interviewBookingOpenedAt: new Date(),
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
