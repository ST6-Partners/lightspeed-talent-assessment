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
import { emailInterviewBookedCandidate, emailBookingStalledHR, emailBookingOutsideWindowHR } from './email.js';

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

async function findCandidate(inv: NormalizedInvitee) {
  if (inv.utmContent) {
    const byToken = await db.query.candidates.findFirst({ where: eq(candidates.interviewBookingToken, inv.utmContent) });
    if (byToken) return byToken;
  }
  if (inv.email) {
    const byEmail = await db.query.candidates.findFirst({ where: eq(candidates.email, inv.email) });
    if (byEmail) return byEmail;
  }
  return null;
}

/** Handle a verified Calendly webhook event. Never throws. */
export async function applyCalendlyEvent(event: string, payload: any): Promise<{ handled: boolean; detail: string }> {
  const inv = normalize(payload);
  const candidate = await findCandidate(inv);
  if (!candidate) return { handled: false, detail: 'no candidate matched' };

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

    await emailInterviewBookedCandidate({
      email: candidate.email,
      firstName: candidate.firstName,
      jobTitle,
      interviewDate: start ? start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'the scheduled time',
      joinUrl: inv.joinUrl,
    }).catch((err) => console.error('[Calendly] confirmation email failed:', err));

    // 48-hour window / target-window guard on the self-book path (parity with
    // interviews.updateRound). A booking already made in Calendly can't be
    // blocked here, so flag HR when it lands outside the plan.
    if (start) {
      let reason: string | null = null;
      const ws = candidate.interviewWindowStart ? new Date(candidate.interviewWindowStart as any) : null;
      const we = candidate.interviewWindowEnd ? new Date(candidate.interviewWindowEnd as any) : null;
      if (ws && start < ws) reason = `Booked ${start.toISOString()}, before the target window opens (${ws.toISOString()}).`;
      else if (we && start > we) reason = `Booked ${start.toISOString()}, after the target window closes (${we.toISOString()}).`;
      if (!reason) {
        const rounds = await db.select().from(candidateInterviews).where(eq(candidateInterviews.candidateId, candidate.id));
        const times = rounds.filter((r: any) => r.scheduledAt).map((r: any) => new Date(r.scheduledAt as any).getTime());
        times.push(start.getTime());
        if (times.length > 1) {
          const spreadH = (Math.max(...times) - Math.min(...times)) / 3_600_000;
          if (spreadH > 48) reason = `This booking spreads the candidate's interview rounds across ${Math.round(spreadH)} hours (limit 48).`;
        }
      }
      if (reason) {
        console.warn(`[Calendly] ${candidate.email} booked outside window: ${reason}`);
        await emailBookingOutsideWindowHR({
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          jobTitle,
          reason,
        }).catch((err) => console.error('[Calendly] outside-window HR email failed:', err));
      }
    }

    console.log(`[Calendly] ${candidate.email} booked -> Interview Scheduled`);
    return { handled: true, detail: `booked ${candidate.email}` };
  }

  if (event === 'invitee.canceled') {
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
