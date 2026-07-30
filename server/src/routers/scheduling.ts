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
import { emailBookingInvite, emailScreeningCallInvite, emailInterviewerDeclinedRoleManager, buildInterviewerAvailabilityEmail, sendEmail, HIRING_TEAM_INBOX } from '../services/email.js';

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
      return {
        role: `${req.department}${jd?.jobTitle ? ' · ' + jd.jobTitle : ''}`,
        interviewerEmail: dec.email,
        windows: (existing?.windows as any) ?? null,
        note: existing?.note ?? null,
        alreadySubmitted: !!existing,
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
