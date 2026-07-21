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
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { emailBookingInvite, emailScreeningCallInvite } from '../services/email.js';
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
      };
    }),
});
