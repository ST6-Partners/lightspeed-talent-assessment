// ============================================================
// CALENDLY — interview self-scheduling integration.
//
// The candidate books through a Calendly scheduling link (which is synced to
// the interviewer's real calendar and can auto-create the Zoom meeting).
// Calendly then POSTs a webhook to /api/webhooks/calendly:
//   • invitee.created  → record the booked time + join URL, advance the
//                        candidate to 'Interview Scheduled', email confirmation.
//   • invitee.canceled → clear the booking and flag HR.
//
// Matching: we pass our booking token as utm_content on the scheduling link,
// so the webhook maps the booking back to the candidate; we fall back to the
// invitee email when the tracking param is absent.
//
// Env-gated: with no CALENDLY_WEBHOOK_SIGNING_KEY the webhook route rejects
// (nothing to verify against) so the flow is safe to wire before real creds.
// CALENDLY_SCHEDULING_URL is the default org/interviewer scheduling link.
// ============================================================

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { and } from 'drizzle-orm';
import { WALKTHROUGH_ROUND_NAME } from './workSampleWalkthrough.js';
import { emailInterviewBookedCandidate, emailBookingStalledHR } from './email.js';
import { prepInterviewQuestions } from './interviewPrep.js';

export function isCalendlyConfigured(): boolean {
  return Boolean(process.env.CALENDLY_WEBHOOK_SIGNING_KEY);
}

/**
 * Pull the numeric Zoom meeting ID out of a join URL so the Zoom
 * recording webhook can match the recording back to this candidate.
 * Handles zoom.us / *.zoom.us join links, e.g.
 *   https://us02web.zoom.us/j/12345678901?pwd=... -> "12345678901"
 * Returns null for non-Zoom links (Google Meet, Teams, etc.).
 */
export function extractZoomMeetingId(joinUrl: string | null | undefined): string | null {
  if (!joinUrl) return null;
  const m = joinUrl.match(/zoom\.us\/(?:j|w|s|my)\/([0-9]{9,})/i);
  return m ? m[1] : null;
}

export function defaultSchedulingUrl(): string {
  return (process.env.CALENDLY_SCHEDULING_URL ?? '').trim();
}

// Booking link for the phone-screen stage. Point this at the Zoom Scheduler
// page (Outlook-connected) configured as a phone/audio slot — the recruiter
// calls the candidate at the number they provide. No video meeting is created.
// (We link out to this URL; we do not embed a Calendly widget for phone screens.)
export function phoneScreenSchedulingUrl(): string {
  return (process.env.PHONE_SCREEN_SCHEDULING_URL ?? '').trim();
}

/**
 * Verify Calendly's webhook signature.
 * Header format: "t=<unix>,v1=<hmac-sha256(signingKey, `${t}.${body}`)>".
 */
export function verifyCalendlySignature(rawBody: string, header: string | undefined, signingKey: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=').map((s) => s.trim()) as [string, string]));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(`${t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

interface NormalizedInvitee {
  email?: string;
  utmContent?: string;      // our booking token
  startTime?: string;
  joinUrl?: string;
  eventUri?: string;
  cancelUrl?: string;
}

function normalize(payload: any): NormalizedInvitee {
  const ev = payload?.scheduled_event ?? {};
  const loc = ev?.location ?? {};
  return {
    email: payload?.email,
    utmContent: payload?.tracking?.utm_content,
    startTime: ev?.start_time,
    joinUrl: loc?.join_url,
    eventUri: ev?.uri,
    cancelUrl: payload?.cancel_url ?? payload?.reschedule_url,
  };
}

type BookingMode = 'interview' | 'work_sample_walkthrough';
async function findCandidate(inv: NormalizedInvitee): Promise<{ candidate: any; mode: BookingMode } | null> {
  if (inv.utmContent) {
    // Walkthrough token first — it has its own link so a walkthrough booking is
    // never mistaken for an interview booking (which would move the stage).
    const byWs = await db.query.candidates.findFirst({ where: eq(candidates.workSampleBookingToken, inv.utmContent) });
    if (byWs) return { candidate: byWs, mode: 'work_sample_walkthrough' };
    const byToken = await db.query.candidates.findFirst({ where: eq(candidates.interviewBookingToken, inv.utmContent) });
    if (byToken) return { candidate: byToken, mode: 'interview' };
  }
  if (inv.email) {
    const byEmail = await db.query.candidates.findFirst({ where: eq(candidates.email, inv.email) });
    if (byEmail) return { candidate: byEmail, mode: 'interview' };
  }
  return null;
}

/** Handle a verified Calendly webhook event. Never throws. */
export async function applyCalendlyEvent(event: string, payload: any): Promise<{ handled: boolean; detail: string }> {
  const inv = normalize(payload);
  const match = await findCandidate(inv);
  if (!match) return { handled: false, detail: 'no candidate matched' };
  const { candidate, mode } = match;

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle = jd?.jobTitle ?? undefined;

  if (event === 'invitee.created') {
    const start = inv.startTime ? new Date(inv.startTime) : null;
    // Auto-capture the Zoom meeting ID from the booked join URL so the Zoom
    // recording webhook can match the recording back to this candidate with no
    // manual entry. Only overwrite when we actually parse one out.
    const zoomMeetingId = extractZoomMeetingId(inv.joinUrl);

    // WORK SAMPLE WALKTHROUGH: record the time on the walkthrough round only.
    // Do NOT touch currentStage (the walkthrough sits at the Work Sample step,
    // after the interview) and do NOT generate interview questions.
    if (mode === 'work_sample_walkthrough') {
      await db.update(candidates).set({
        workSampleScheduledAt: start,
        workSampleJoinUrl: inv.joinUrl ?? null,
        ...(zoomMeetingId ? { zoomMeetingId } : {}),
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));

      await db.update(candidateInterviews).set({
        scheduledAt: start,
        status: 'scheduled',
        updatedAt: new Date(),
      }).where(and(
        eq(candidateInterviews.candidateId, candidate.id),
        eq(candidateInterviews.roundName, WALKTHROUGH_ROUND_NAME),
      ));

      await emailInterviewBookedCandidate({
        email: candidate.email,
        firstName: candidate.firstName,
        jobTitle,
        interviewDate: start ? start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'the scheduled time',
        joinUrl: inv.joinUrl,
        kind: 'work_sample_walkthrough',
      }).catch((err) => console.error('[Calendly] walkthrough confirmation email failed:', err));

      console.log(`[Calendly] ${candidate.email} booked work sample walkthrough`);
      return { handled: true, detail: `booked walkthrough ${candidate.email}` };
    }

    await db.update(candidates).set({
      interviewScheduledAt: start,
      interviewJoinUrl: inv.joinUrl ?? null,
      calendlyEventUri: inv.eventUri ?? null,
      calendlyCancelUrl: inv.cancelUrl ?? null,
      ...(zoomMeetingId ? { zoomMeetingId } : {}),
      ...(candidate.currentStage !== 'Interview Scheduled' ? { currentStage: 'Interview Scheduled' as const } : {}),
      updatedAt: new Date(),
    }).where(eq(candidates.id, candidate.id));
    if (zoomMeetingId) console.log(`[Calendly] captured Zoom meeting ID ${zoomMeetingId} for ${candidate.email}`);

    if (candidate.currentStage !== 'Interview Scheduled') {
      await db.insert(candidateStageHistory).values({
        candidateId: candidate.id,
        fromStage: candidate.currentStage,
        toStage: 'Interview Scheduled',
        changedBy: null,
        reason: `Candidate booked via Calendly${start ? ` for ${start.toISOString()}` : ''}`,
      });
    }

    // Tailored interview questions are generated once the interview is scheduled.
    void prepInterviewQuestions(db, candidate.id).catch((err) => console.error('[Calendly] interview question prep failed:', err));

    await emailInterviewBookedCandidate({
      email: candidate.email,
      firstName: candidate.firstName,
      jobTitle,
      interviewDate: start ? start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'the scheduled time',
      joinUrl: inv.joinUrl,
    }).catch((err) => console.error('[Calendly] confirmation email failed:', err));

    console.log(`[Calendly] ${candidate.email} booked -> Interview Scheduled`);
    return { handled: true, detail: `booked ${candidate.email}` };
  }

  if (event === 'invitee.canceled') {
    if (mode === 'work_sample_walkthrough') {
      await db.update(candidates).set({
        workSampleScheduledAt: null,
        workSampleJoinUrl: null,
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));
      await db.update(candidateInterviews).set({ scheduledAt: null, status: 'planned', updatedAt: new Date() })
        .where(and(
          eq(candidateInterviews.candidateId, candidate.id),
          eq(candidateInterviews.roundName, WALKTHROUGH_ROUND_NAME),
        ));
      console.log(`[Calendly] ${candidate.email} canceled work sample walkthrough`);
      return { handled: true, detail: `canceled walkthrough ${candidate.email}` };
    }
    await db.update(candidates).set({
      interviewScheduledAt: null,
      interviewJoinUrl: null,
      updatedAt: new Date(),
    }).where(eq(candidates.id, candidate.id));

    await emailBookingStalledHR({
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      jobTitle,
      daysOpen: 0,
    }).catch((err) => console.error('[Calendly] cancel HR email failed:', err));

    console.log(`[Calendly] ${candidate.email} canceled interview`);
    return { handled: true, detail: `canceled ${candidate.email}` };
  }

  return { handled: false, detail: `ignored event ${event}` };
}
