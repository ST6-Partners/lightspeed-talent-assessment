// ============================================================
// SCHEDULING ROUTER — interview self-scheduling via Calendly.
//
// Flow:
//   1. HR opens scheduling for a candidate (open). We set the Calendly
//      scheduling link (from input, the candidate, or CALENDLY_SCHEDULING_URL)
//      and email the candidate a booking link → our /book-interview/:token page.
//   2. That page embeds Calendly, prefilled with the candidate's name/email and
//      our booking token as utm_content so the webhook can match the booking.
//   3. Calendly fires invitee.created to /api/webhooks/calendly, which records
//      the time + join URL and advances the candidate to 'Interview Scheduled'.
//
// Public (tokenized): getBookingContext. Protected: open, statusFor.
// ============================================================

import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { employees } from '../db/schema/employees.js';
import { interviewerAvailability } from '../db/schema/interviewerAvailability.js';
import { inboundEmails } from '../db/schema/email.js';
import { interviewPlan, hiringTeam } from '../db/schema/intake.js';
import { INTERVIEW_WINDOW_HOURS } from './interviews.js';
import { emailBookingInvite, emailScreeningCallInvite, emailInterviewerDeclinedRoleManager, buildInterviewerAvailabilityEmail, sendEmail, HIRING_TEAM_INBOX, emailPhoneScreenCandidateWindow, emailPhoneScreenConfirmedRecruiter, emailPhoneScreenNoAvailabilityRecruiter, emailPhoneScreenConfirmedCandidate } from '../services/email.js';

// Capability tokens for the interviewer "can't interview for this role" link that
// ships in the intake-approval availability email. reqId is a random UUID, so the
// encoded token is effectively unguessable (same idea as the work-sample/EEO links).
export function encodeInterviewerDeclineToken(reqId: string, email: string): string {
  return Buffer.from(`${reqId}|${email}`, 'utf8').toString('base64url');
}
function decodeInterviewerDeclineToken(token: string): { reqId: string; email: string } | null {
  try {
    const parts = Buffer.from(token, 'base64url').toString('utf8').split('|');
    const reqId = parts.shift() ?? '';
    const email = parts.join('|');
    if (!reqId || !email) return null;
    return { reqId, email };
  } catch { return null; }
}
import { defaultSchedulingUrl, phoneScreenSchedulingUrl, isCalendlyConfigured } from '../services/calendly.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

// Format a recruiter-entered availability window into a readable line for the
// candidate email / confirmation page (stored as text in phone_screen_availability).
function fmtClock(t: string): string {
  const [h, m] = String(t).split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return String(t);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, '0')} ${ap}`;
}
function fmtAvailabilityWindow(w: { date: string; start: string; end: string }): string {
  const d = new Date(`${w.date}T00:00:00`);
  const day = Number.isNaN(d.getTime())
    ? w.date
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${fmtClock(w.start)} – ${fmtClock(w.end)}`;
}

async function jobTitleFor(db: any, jdId: string | null | undefined): Promise<string | undefined> {
  if (!jdId) return undefined;
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) });
  return jd?.jobTitle ?? undefined;
}

/** Append name/email/utm_content prefill params to a Calendly scheduling URL. */
function prefillCalendlyUrl(base: string, name: string, email: string, token: string): string {
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ name, email, utm_content: token });
  return `${base}${sep}${params.toString()}`;
}

// ── Interviewer availability window (progressive narrowing) ────────────────
// Before anyone submits, interviews target 3–4 weeks after the role opened.
// Once the first interviewer submits, the window clamps to ±INTERVIEW_WINDOW_HOURS
// business hours around their earliest offered slot. Once a second submits AND
// there are more than 2 rounds, it collapses to a single INTERVIEW_WINDOW_HOURS-
// business-hour span containing the first two, so every remaining round lands in
// one tight cluster. Weekends never count. Derived live (no stored state) from the
// role's postedAt, its interview rounds, and who has submitted so far.
const DAY_MS = 24 * 60 * 60 * 1000;

function addBusinessHours(startMs: number, hours: number): number {
  const STEP = 15 * 60 * 1000;
  let remaining = Math.abs(hours) * 3_600_000;
  const dir = hours >= 0 ? 1 : -1;
  let t = startMs;
  let guard = 0;
  while (remaining > 0 && guard++ < 200000) {
    if (dir > 0) {
      const day = new Date(t).getDay();
      if (day !== 0 && day !== 6) remaining -= STEP;
      t += STEP;
    } else {
      t -= STEP;
      const day = new Date(t).getDay();
      if (day !== 0 && day !== 6) remaining -= STEP;
    }
  }
  return t;
}

function earliestSlotMs(windows: any): number | null {
  if (!Array.isArray(windows)) return null;
  let min: number | null = null;
  for (const w of windows) {
    if (!w?.date) continue;
    const ms = Date.parse(`${w.date}T${w.start || '00:00'}`);
    if (!Number.isNaN(ms)) min = min == null ? ms : Math.min(min, ms);
  }
  return min;
}

interface AvailWindow { start: Date; end: Date; stage: number; }

async function computeAvailabilityWindow(db: any, reqId: string, excludeEmail?: string): Promise<AvailWindow> {
  const req = (await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, reqId)).limit(1))[0];
  const base = req?.postedAt ? new Date(req.postedAt).getTime()
    : req?.createdAt ? new Date(req.createdAt).getTime() : Date.now();
  const stage0 = (): AvailWindow => ({ start: new Date(base + 21 * DAY_MS), end: new Date(base + 28 * DAY_MS), stage: 0 });

  const rounds = await db.select().from(interviewPlan).where(eq(interviewPlan.reqId, reqId));
  const roundCount = rounds.length;

  let subs = await db.select().from(interviewerAvailability)
    .where(eq(interviewerAvailability.reqId, reqId)).orderBy(asc(interviewerAvailability.submittedAt));
  if (excludeEmail) subs = subs.filter((r: any) => (r.email || '').toLowerCase() !== excludeEmail.toLowerCase());
  if (subs.length === 0) return stage0();

  const t1 = earliestSlotMs(subs[0].windows);
  if (t1 == null) return stage0();

  if (subs.length >= 2 && roundCount > 2) {
    const t2 = earliestSlotMs(subs[1].windows);
    const b = t2 == null ? t1 : Math.min(t1, t2);
    return { start: new Date(b), end: new Date(addBusinessHours(b, INTERVIEW_WINDOW_HOURS)), stage: 2 };
  }
  return {
    start: new Date(addBusinessHours(t1, -INTERVIEW_WINDOW_HOURS)),
    end: new Date(addBusinessHours(t1, INTERVIEW_WINDOW_HOURS)),
    stage: 1,
  };
}

function fmtWindowRange(start: Date, end: Date): string {
  const opt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opt)} – ${end.toLocaleDateString('en-US', opt)}`;
}

export const schedulingRouter = router({
  // ── PROTECTED: HR opens scheduling for a candidate ─────────
  open: protectedProcedure
    .input(z.object({
      candidateId: z.string().uuid(),
      calendlyUrl: z.string().url().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const bookingToken = candidate.interviewBookingToken ?? randomUUID();
      const schedulingUrl = input.calendlyUrl ?? candidate.calendlySchedulingUrl ?? defaultSchedulingUrl();

      await ctx.db.update(candidates).set({
        interviewBookingToken: bookingToken,
        interviewBookingOpenedAt: new Date(),
        ...(schedulingUrl ? { calendlySchedulingUrl: schedulingUrl } : {}),
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));

      const bookingUrl = `${appBaseUrl()}/book-interview/${bookingToken}`;
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);

      await emailBookingInvite({
        email: candidate.email,
        firstName: candidate.firstName,
        jobTitle,
        bookingUrl,
      }).catch((err) => console.error('[scheduling.open] booking invite failed:', err));

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'open_scheduling', 'candidates', { candidateId: candidate.id }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));

      return {
        bookingUrl,
        schedulingUrlSet: !!schedulingUrl,
        calendlyConfigured: isCalendlyConfigured(),
      };
    }),

  // ── PROTECTED: HR opens a PHONE-SCREEN call for a candidate ─
  // Reuses the same self-booking mechanism as interviews, but points at the
  // phone-call Calendly event and sends phone-framed copy (no video link).
  openPhoneScreen: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const token = candidate.phoneScreenBookingToken ?? randomUUID();
      await ctx.db.update(candidates).set({
        phoneScreenBookingToken: token,
        phoneScreenBookingOpenedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));

      const bookingUrl = `${appBaseUrl()}/book-interview/${token}`;
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      await emailScreeningCallInvite({
        email: candidate.email, firstName: candidate.firstName, jobTitle, bookingUrl,
      }).catch((err) => console.error('[scheduling.openPhoneScreen] invite failed:', err));

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'open_phone_screen', 'candidates', { candidateId: candidate.id }).catch((err) => console.warn('[telemetry] trackActivity failed (non-blocking):', err));
      return { bookingUrl, phoneUrlSet: !!phoneScreenSchedulingUrl() };
    }),

  // ── PROTECTED: phone-screen booking state for the panel ────
  phoneScreenStatusFor: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        opened: !!candidate.phoneScreenBookingOpenedAt,
        scheduledAt: candidate.phoneScreenScheduledAt,
        bookingUrl: candidate.phoneScreenBookingToken ? `${appBaseUrl()}/book-interview/${candidate.phoneScreenBookingToken}` : null,
        phoneUrlSet: !!phoneScreenSchedulingUrl(),
        recruiterUrl: (candidate as any).phoneScreenRecruiterToken ? `${appBaseUrl()}/phone-screen-availability/${(candidate as any).phoneScreenRecruiterToken}` : null,
        availability: (candidate as any).phoneScreenAvailability ?? null,
        selectedSlot: (candidate as any).phoneScreenSelectedSlot ?? null,
      };
    }),

  // ── PROTECTED: booking state for the candidate panel ───────
  statusFor: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        opened: !!candidate.interviewBookingOpenedAt,
        scheduledAt: candidate.interviewScheduledAt,
        joinUrl: candidate.interviewJoinUrl,
        cancelUrl: candidate.calendlyCancelUrl,
        schedulingUrl: candidate.calendlySchedulingUrl,
        bookingUrl: candidate.interviewBookingToken ? `${appBaseUrl()}/book-interview/${candidate.interviewBookingToken}` : null,
        calendlyConfigured: isCalendlyConfigured(),
      };
    }),

  // ── PUBLIC: candidate opens their booking link ─────────────
  getBookingContext: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // The token may be an interview booking token OR a phone-screen token.
      let candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.interviewBookingToken, input.token),
      });
      let mode: 'interview' | 'phone_screen' | 'work_sample_walkthrough' = 'interview';
      if (!candidate) {
        candidate = await ctx.db.query.candidates.findFirst({
          where: eq(candidates.phoneScreenBookingToken, input.token),
        });
        mode = 'phone_screen';
      }
      if (!candidate) {
        candidate = await ctx.db.query.candidates.findFirst({
          where: eq(candidates.workSampleBookingToken, input.token),
        });
        mode = 'work_sample_walkthrough';
      }
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This booking link is invalid or has expired.' });
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      const alreadyBooked = mode === 'phone_screen'
        ? !!candidate.phoneScreenScheduledAt
        : mode === 'work_sample_walkthrough'
          ? !!candidate.workSampleScheduledAt
          : !!candidate.interviewScheduledAt;
      // Interview: embed the Calendly widget (prefilled). Phone screen: link OUT to
      // the Zoom Scheduler page (Outlook-connected) — no embed, no video link.
      const interviewBase = candidate.calendlySchedulingUrl ?? defaultSchedulingUrl();
      const scheduledAt = mode === 'phone_screen'
        ? candidate.phoneScreenScheduledAt
        : mode === 'work_sample_walkthrough'
          ? candidate.workSampleScheduledAt
          : candidate.interviewScheduledAt;
      const joinUrl = mode === 'work_sample_walkthrough'
        ? candidate.workSampleJoinUrl
        : mode === 'phone_screen' ? null : candidate.interviewJoinUrl;
      return {
        mode,
        firstName: candidate.firstName,
        jobTitle: jobTitle ?? null,
        alreadyBooked,
        scheduledAt,
        joinUrl,
        // Embedded Calendly widget URL (interview + walkthrough modes).
        calendlyUrl: (mode === 'interview' || mode === 'work_sample_walkthrough') && interviewBase
          ? prefillCalendlyUrl(interviewBase, `${candidate.firstName} ${candidate.lastName}`, candidate.email, input.token)
          : null,
        // External booking link to open (phone-screen / Zoom Scheduler mode).
        schedulingUrl: mode === 'phone_screen' ? (phoneScreenSchedulingUrl() || null) : null,
        // Recruiter-submitted availability windows for the phone screen (recruiter-first flow).
        availability: mode === 'phone_screen' ? ((candidate as any).phoneScreenAvailability ?? null) : null,
        slots: mode === 'phone_screen'
          ? (Array.isArray((candidate as any).phoneScreenSlots)
              ? ((candidate as any).phoneScreenSlots as any[]).map((s) => (typeof s === 'string' ? s : s.label))
              : ((candidate as any).phoneScreenAvailability
                  ? String((candidate as any).phoneScreenAvailability).split('\n').filter((l: string) => l.trim() && !l.startsWith('Note:'))
                  : []))
          : null,
        selectedSlot: mode === 'phone_screen' ? ((candidate as any).phoneScreenSelectedSlot ?? null) : null,
      };
    }),

  // ── PUBLIC: recruiter opens their phone-screen availability link ───────────
  phoneScreenSchedulingContext: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.phoneScreenRecruiterToken, input.token) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid or has expired.' });
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      return {
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        jobTitle: jobTitle ?? null,
        availability: (candidate as any).phoneScreenAvailability ?? null,
        submitted: !!candidate.phoneScreenBookingOpenedAt,
        candidateBooked: !!candidate.phoneScreenScheduledAt,
        candidateSlots: Array.isArray((candidate as any).phoneScreenCandidateSlots) ? ((candidate as any).phoneScreenCandidateSlots as string[]) : [],
        selectedSlot: (candidate as any).phoneScreenSelectedSlot ?? null,
      };
    }),

  // ── PUBLIC: recruiter submits availability → candidate is emailed the window ─
  submitPhoneScreenAvailability: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      windows: z.array(z.object({
        date: z.string().min(1),
        start: z.string().min(1),
        end: z.string().min(1),
      })).min(1).max(20),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.phoneScreenRecruiterToken, input.token) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid or has expired.' });
      // Keep the raw date/start/end alongside the formatted label so confirmPhoneScreen
      // can parse the real call start/end once the candidate picks a slot — not just
      // display text.
      const slots = input.windows.map((w) => ({ date: w.date, start: w.start, end: w.end, label: fmtAvailabilityWindow(w) }));
      const availabilityText = slots.map((s) => s.label).join('\n')
        + (input.note && input.note.trim() ? `\n\nNote: ${input.note.trim()}` : '');
      const bookingToken = candidate.phoneScreenBookingToken ?? randomUUID();
      await ctx.db.update(candidates).set({
        phoneScreenAvailability: availabilityText,
        phoneScreenSlots: slots,
        phoneScreenSelectedSlot: null,
        phoneScreenBookingToken: bookingToken,
        phoneScreenBookingOpenedAt: new Date(),
        phoneScreenScheduledAt: null,
        phoneScreenEndAt: null,
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      const bookingUrl = `${appBaseUrl()}/book-interview/${bookingToken}`;
      await emailPhoneScreenCandidateWindow({
        email: candidate.email, firstName: candidate.firstName, jobTitle,
        availability: availabilityText, bookingUrl,
      }).catch((err) => console.error('[scheduling.submitPhoneScreenAvailability] candidate email failed:', err));
      return { ok: true as const };
    }),

  // ── PUBLIC: candidate confirms one of the recruiter's windows ──────────────
  confirmPhoneScreen: publicProcedure
    .input(z.object({ token: z.string().min(1), slot: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.phoneScreenBookingToken, input.token) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid or has expired.' });
      // Only accept a slot the recruiter actually offered. Slots are objects
      // ({date,start,end,label}) going forward; older rows may still hold a plain
      // string[] of labels — normalize both to the same shape before matching.
      const offeredRaw: any[] = Array.isArray((candidate as any).phoneScreenSlots) ? (candidate as any).phoneScreenSlots as any[] : [];
      const offered = offeredRaw.map((s) => (typeof s === 'string' ? { label: s } : s));
      const matched = offered.find((s) => s.label === input.slot);
      if (offered.length && !matched) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That time is no longer offered. Please pick one of the listed times.' });
      }
      // Parse the real call start/end from the matched slot's raw date/start/end (the
      // recruiter-entered wall-clock values) so the post-call decision reminder fires
      // at the actual end of the call — e.g. a 3-4pm slot reminds at 4pm — instead of
      // 30 min after whatever moment the candidate happens to click confirm.
      let startAt: Date | null = null;
      let endAt: Date | null = null;
      if (matched?.date && matched?.start && matched?.end) {
        const s = new Date(`${matched.date}T${matched.start}:00`);
        const e = new Date(`${matched.date}T${matched.end}:00`);
        if (!Number.isNaN(s.getTime())) startAt = s;
        if (!Number.isNaN(e.getTime())) endAt = e;
      }
      await ctx.db.update(candidates).set({
        phoneScreenSelectedSlot: input.slot,
        // Fall back to "now" only if we couldn't parse a real time (e.g. a legacy
        // string-only slot with no raw date/start/end) — better than leaving it null.
        phoneScreenScheduledAt: startAt ?? new Date(),
        phoneScreenEndAt: endAt,
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      await emailPhoneScreenConfirmedRecruiter({
        candidateName: `${candidate.firstName} ${candidate.lastName}`, jobTitle, slot: input.slot,
      }).catch((err) => console.error('[scheduling.confirmPhoneScreen] recruiter email failed:', err));
      return { ok: true as const };
    }),

  // ── PUBLIC: candidate says none of the windows work — notify the recruiter ──
  phoneScreenNoAvailability: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      windows: z.array(z.object({ date: z.string().min(1), start: z.string().min(1), end: z.string().min(1) })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.phoneScreenBookingToken, input.token) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid or has expired.' });
      const slotLines = input.windows.map(fmtAvailabilityWindow);
      await ctx.db.update(candidates).set({
        phoneScreenCandidateSlots: slotLines,
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      const recruiterToken = (candidate as any).phoneScreenRecruiterToken as string | null;
      const recruiterUrl = recruiterToken ? `${appBaseUrl()}/phone-screen-availability/${recruiterToken}` : undefined;
      await emailPhoneScreenNoAvailabilityRecruiter({
        candidateName: `${candidate.firstName} ${candidate.lastName}`, jobTitle,
        candidateSlots: slotLines, recruiterUrl,
      }).catch((err) => console.error('[scheduling.phoneScreenNoAvailability] recruiter email failed:', err));
      return { ok: true as const };
    }),

  // ── PUBLIC: recruiter picks one of the candidate's counter-proposed slots ──
  confirmCandidateSlot: publicProcedure
    .input(z.object({ token: z.string().min(1), slot: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.phoneScreenRecruiterToken, input.token) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid or has expired.' });
      const proposed: string[] = Array.isArray((candidate as any).phoneScreenCandidateSlots) ? ((candidate as any).phoneScreenCandidateSlots as string[]) : [];
      if (!proposed.includes(input.slot)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That time is no longer offered. Please pick one of the listed times.' });
      }
      await ctx.db.update(candidates).set({
        phoneScreenSelectedSlot: input.slot,
        phoneScreenScheduledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(candidates.id, candidate.id));
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      await emailPhoneScreenConfirmedCandidate({
        email: candidate.email, firstName: candidate.firstName, jobTitle, slot: input.slot,
      }).catch((err) => console.error('[scheduling.confirmCandidateSlot] candidate email failed:', err));
      return { ok: true as const };
    }),

  // ── PUBLIC: interviewer opens the "can't interview for this role" link from
  // the intake-approval availability email. Context for the confirmation page.
  getInterviewerDeclineContext: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const dec = decodeInterviewerDeclineToken(input.token);
      if (!dec) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid.' });
      const req = (await ctx.db.select().from(jobRequisitions).where(eq(jobRequisitions.id, dec.reqId)).limit(1))[0];
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is no longer valid.' });
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.reqId, req.id)).limit(1))[0];
      return { role: `${req.department}${jd?.jobTitle ? ' · ' + jd.jobTitle : ''}`, interviewerEmail: dec.email };
    }),

  // ── PUBLIC: interviewer confirms they can't take the role — notify their manager.
  declineInterview: publicProcedure
    .input(z.object({ token: z.string().min(1), reason: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const dec = decodeInterviewerDeclineToken(input.token);
      if (!dec) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid.' });
      const req = (await ctx.db.select().from(jobRequisitions).where(eq(jobRequisitions.id, dec.reqId)).limit(1))[0];
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is no longer valid.' });
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.reqId, req.id)).limit(1))[0];
      const emp = (await ctx.db.select().from(employees).where(eq(employees.email, dec.email)).limit(1))[0];
      const to = emp?.managerEmail || process.env.HR_EMAIL || HIRING_TEAM_INBOX;
      // Same token identifies (reqId, declining email); the reassign page uses it
      // to know who is being replaced.
      const reassignUrl = `${appBaseUrl()}/interviewer-reassign/${input.token}`;
      const mgr = await emailInterviewerDeclinedRoleManager({
        to,
        interviewerName: (emp as any)?.name ?? null,
        interviewerEmail: dec.email,
        department: req.department,
        jobTitle: jd?.jobTitle ?? undefined,
        hiringManager: req.hiringManager,
        reason: input.reason,
        reassignUrl,
      });
      // Mirror into the test inbox (HTML) so the manager copy — and its "Assign to
      // someone else" button — is reviewable without a live email provider.
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Lightspeed Hiring',
          toEmail: to, subject: mgr.subject, body: mgr.html,
          replyTag: 'interviewer_declined_role', source: 'simulated',
          raw: { kind: 'interviewer_declined_role', reqId: req.id, reassignUrl },
        });
      } catch (err) { console.error('[scheduling] decline inbox record failed:', err); }
      return { ok: true, viaHrFallback: !emp?.managerEmail };
    }),

  // ── PUBLIC: manager opens the "Assign to someone else" link from the decline
  // notification and names a replacement interviewer. Replaces the declining
  // interviewer on this requisition's rounds + hiring team, then fires the SAME
  // availability request to the new person (with their own fresh links, so they
  // can set availability or decline in turn).
  reassignInterviewer: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      name: z.string().min(1, 'Enter the replacement interviewer\'s name.').max(200),
      email: z.string().email('Enter a valid email address.'),
    }))
    .mutation(async ({ ctx, input }) => {
      const dec = decodeInterviewerDeclineToken(input.token);
      if (!dec) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid.' });
      const req = (await ctx.db.select().from(jobRequisitions).where(eq(jobRequisitions.id, dec.reqId)).limit(1))[0];
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is no longer valid.' });
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.reqId, req.id)).limit(1))[0];
      const newEmail = input.email.trim().toLowerCase();
      const newName = input.name.trim();
      if (newEmail === dec.email.toLowerCase()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That is the same interviewer who declined — choose a different person.' });
      }

      // Replace the declining interviewer wherever they were set for this role.
      await ctx.db.update(interviewPlan)
        .set({ interviewer: newName, interviewerEmail: newEmail })
        .where(and(eq(interviewPlan.reqId, dec.reqId), eq(interviewPlan.interviewerEmail, dec.email)));
      await ctx.db.update(hiringTeam)
        .set({ personRef: newEmail })
        .where(and(eq(hiringTeam.reqId, dec.reqId), eq(hiringTeam.personRef, dec.email)));

      // Fire the identical availability email to the new interviewer, fresh tokens.
      const token = encodeInterviewerDeclineToken(dec.reqId, newEmail);
      const rounds = await ctx.db.select().from(interviewPlan)
        .where(eq(interviewPlan.reqId, dec.reqId)).orderBy(asc(interviewPlan.sortOrder));
      const avail = buildInterviewerAvailabilityEmail({
        department: req.department,
        jobTitle: jd?.jobTitle ?? undefined,
        hiringManager: req.hiringManager,
        schedulingUrl: `${appBaseUrl()}/interviewer-availability/${token}`,
        declineUrl: `${appBaseUrl()}/interviewer-unavailable/${token}`,
        rounds,
      });
      try { await sendEmail({ to: newEmail, subject: avail.subject, html: avail.html, templateId: 'interviewer_availability' }); }
      catch (err) { console.error('[scheduling] reassign availability send failed:', err); }
      // Mirror into the test inbox (HTML) so it's reviewable without a live provider.
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Lightspeed Hiring',
          toEmail: newEmail, subject: avail.subject, body: avail.html,
          replyTag: 'interviewer_availability', source: 'simulated',
          raw: { kind: 'interviewer_availability', reqId: dec.reqId, reassignedFrom: dec.email },
        });
      } catch (err) { console.error('[scheduling] reassign inbox record failed:', err); }

      const role = `${req.department}${jd?.jobTitle ? ' \u00b7 ' + jd.jobTitle : ''}`;
      return { ok: true, role, newName, newEmail };
    }),

  // ── PUBLIC: interviewer opens the self-serve availability link from the
  // intake-approval email (no login). Context for the availability page.
  getInterviewerAvailabilityContext: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const dec = decodeInterviewerDeclineToken(input.token);
      if (!dec) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid.' });
      const req = (await ctx.db.select().from(jobRequisitions).where(eq(jobRequisitions.id, dec.reqId)).limit(1))[0];
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is no longer valid.' });
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.reqId, req.id)).limit(1))[0];
      const existing = (await ctx.db.select().from(interviewerAvailability)
        .where(and(eq(interviewerAvailability.reqId, dec.reqId), eq(interviewerAvailability.email, dec.email))).limit(1))[0];
      const win = await computeAvailabilityWindow(ctx.db, dec.reqId, dec.email);
      return {
        role: `${req.department}${jd?.jobTitle ? ' · ' + jd.jobTitle : ''}`,
        interviewerEmail: dec.email,
        windows: (existing?.windows as any) ?? null,
        note: existing?.note ?? null,
        alreadySubmitted: !!existing,
        windowStart: win.start.toISOString(),
        windowEnd: win.end.toISOString(),
        stage: win.stage,
      };
    }),

  // ── PUBLIC: interviewer submits (or updates) their availability. Stores it and
  // drops a summary into the hiring-team inbox so scheduling can begin.
  submitInterviewerAvailability: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      windows: z.array(z.object({
        date: z.string().min(1).max(20),
        start: z.string().min(1).max(10),
        end: z.string().min(1).max(10),
      })).min(1, 'Add at least one time you are available.').max(30),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dec = decodeInterviewerDeclineToken(input.token);
      if (!dec) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is invalid.' });
      const req = (await ctx.db.select().from(jobRequisitions).where(eq(jobRequisitions.id, dec.reqId)).limit(1))[0];
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This link is no longer valid.' });
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.reqId, req.id)).limit(1))[0];
      const emp = (await ctx.db.select().from(employees).where(eq(employees.email, dec.email)).limit(1))[0];
      const name = (emp as any)?.name ?? null;

      // Enforce the progressive interview window (based on everyone who submitted
      // before this person; excludes their own prior row so a re-submit isn't self-blocked).
      const win = await computeAvailabilityWindow(ctx.db, dec.reqId, dec.email);
      const ws = win.start.getTime();
      const we = win.end.getTime();
      const outOfWindow = input.windows.some((w) => {
        const st = Date.parse(`${w.date}T${w.start || '00:00'}`);
        const en = Date.parse(`${w.date}T${w.end || w.start || '23:59'}`);
        if (Number.isNaN(st)) return true;
        return st < ws || (Number.isNaN(en) ? st > we : en > we);
      });
      if (outOfWindow) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Please choose times within this role's interview window (${fmtWindowRange(win.start, win.end)}) so all rounds stay close together. If you can't make that window, use the "I can't interview" option instead.`,
        });
      }

      const existing = (await ctx.db.select().from(interviewerAvailability)
        .where(and(eq(interviewerAvailability.reqId, dec.reqId), eq(interviewerAvailability.email, dec.email))).limit(1))[0];
      if (existing) {
        await ctx.db.update(interviewerAvailability)
          .set({ windows: input.windows, note: input.note ?? null, name, updatedAt: new Date() })
          .where(eq(interviewerAvailability.id, existing.id));
      } else {
        await ctx.db.insert(interviewerAvailability)
          .values({ reqId: dec.reqId, email: dec.email, name, windows: input.windows, note: input.note ?? null });
      }

      const role = `${req.department}${jd?.jobTitle ? ' · ' + jd.jobTitle : ''}`;
      const who = name || dec.email;
      const lines = input.windows.map((w) => `\u2022 ${w.date} ${w.start}\u2013${w.end}`).join('\n');
      const body = `${who} submitted interview availability for ${role}:\n\n${lines}${input.note ? `\n\nNote: ${input.note}` : ''}`;
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Lightspeed Hiring',
          toEmail: HIRING_TEAM_INBOX,
          subject: `Interviewer availability: ${who} \u2014 ${role}`,
          body,
          replyTag: 'interviewer_availability_submitted',
          source: 'simulated',
          raw: { kind: 'interviewer_availability_submitted', reqId: dec.reqId, email: dec.email },
        });
      } catch (err) { console.error('[scheduling] availability inbox record failed:', err); }

      return { ok: true, role };
    }),
});
