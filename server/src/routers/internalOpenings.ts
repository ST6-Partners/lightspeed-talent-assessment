// ============================================================
// INTERNAL OPENINGS — HR announces a role internally + employees
// express interest. HR-triggered (safe): emails the employee roster
// via SendGrid; the link opens a tokenless express-interest page
// that creates an internal-tagged candidate. Auto-on-posting and
// Greenhouse-driven apply come later.
// ============================================================
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { employees } from '../db/schema/employees.js';
import { inboundEmails } from '../db/schema/email.js';
import { sendEmail, emailPostingOpenedExternal, HIRING_TEAM_INBOX } from '../services/email.js';
import { getPostingWindows, writeExternalOpenMarker } from '../services/posting.js';
import { trackActivity } from '../services/telemetry.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

export const internalOpeningsRouter = router({
  // Server-authoritative internal-first posting windows for all Open roles.
  postingWindows: protectedProcedure
    .query(async ({ ctx }) => {
      const reqs = await ctx.db.query.jobRequisitions.findMany({ where: eq(jobRequisitions.status, 'Open') });
      return getPostingWindows(ctx.db, reqs.map((r: any) => r.id));
    }),

  // HR opens a role to external candidates early (before the 3-day window closes).
  openExternallyNow: protectedProcedure
    .input(z.object({ reqId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.reqId) });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      if ((req as any).externalOpenedAt) return { ok: true as const, already: true };
      const jd = await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.reqId, input.reqId) });
      const jobTitle = jd?.jobTitle ?? `${req.department} role`;
      await ctx.db.update(jobRequisitions).set({ externalOpenedAt: new Date(), updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      await writeExternalOpenMarker(ctx.db, input.reqId, jobTitle, req.department, 'manual');
      await emailPostingOpenedExternal(HIRING_TEAM_INBOX, { jobTitle, department: req.department, mode: 'manual' }).catch(() => {});
      trackActivity(ctx.db, ctx.user.id, 'open_role_external', 'job_requisitions', { reqId: input.reqId }).catch(() => {});
      return { ok: true as const };
    }),

  // HR announces a role internally to the employee roster.
  announceInternally: protectedProcedure
    .input(z.object({ jdId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const jd = await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, input.jdId) });
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND' });
      const req = (jd as any).reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, (jd as any).reqId) }) : null;
      const title = jd.jobTitle;
      const dept = (req as any)?.department ?? '';
      const url = `${appBaseUrl()}/apply-internal/${jd.id}`;

      const emps = await ctx.db.query.employees.findMany({ where: eq(employees.active, true) });
      const recipients = emps.map((e: any) => e.email).filter((e: string) => e && e.includes('@'));

      const subject = `Internal opening: ${title}${dept ? ` (${dept})` : ''}`;
      const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
        <h2>New internal opening</h2>
        <p>We're opening a new role: <strong>${title}</strong>${dept ? ` in ${dept}` : ''}.</p>
        <p>This role is open to internal applicants first for the next <strong>3 days</strong> before it posts externally. If you're interested, please let us know, and give your manager a heads-up as well.</p>
        <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Express interest</a></p>
        <p style="font-size:12px;color:#666;">Or paste this link: ${url}</p>
        <p>Lightspeed Systems Talent</p>
      </div>`;

      let sent = 0;
      for (const to of recipients) {
        await sendEmail({ to, subject, html, templateId: 'internal_opening' }).catch(() => {});
        sent++;
      }
      // One summary copy into the test inbox (not one per employee).
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'careers@lightspeedsystems.com', fromName: 'Lightspeed Careers',
          toEmail: `all employees (${sent})`, subject, body: html, replyTag: 'internal_opening', source: 'simulated',
          raw: { kind: 'internal_opening', jdId: jd.id, recipients: sent },
        });
      } catch (err) { console.error('[internal opening] inbox record failed', err); }

      trackActivity(ctx.db, ctx.user.id, 'announce_internal', 'job_descriptions', { jdId: jd.id, sent }).catch(() => {});
      return { sent };
    }),

  // Public: the express-interest page loads the role.
  getRoleForInternal: publicProcedure
    .input(z.object({ jdId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const jd = await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, input.jdId) });
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND', message: 'This opening is no longer available.' });
      const req = (jd as any).reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, (jd as any).reqId) }) : null;
      return { jobTitle: jd.jobTitle, department: (req as any)?.department ?? null, summary: jd.summary ?? null };
    }),

  // Public: an employee expresses interest -> creates an internal-tagged candidate.
  applyInternal: publicProcedure
    .input(z.object({
      jdId: z.string().uuid(),
      name: z.string().min(1).max(200),
      email: z.string().email().max(300),
      currentRole: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const jd = await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, input.jdId) });
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND', message: 'This opening is no longer available.' });
      const parts = input.name.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || firstName;

      const [candidate] = await ctx.db.insert(candidates).values({
        jdId: input.jdId, firstName, lastName, email: input.email,
        source: 'Internal', isInternal: true, internalEmployee: input.currentRole ?? null,
        currentStage: 'Applied',
      } as any).returning();

      await ctx.db.insert(candidateStageHistory).values({
        candidateId: candidate.id, fromStage: null, toStage: 'Applied', changedBy: null,
        reason: 'Internal application (expressed interest)',
      });
      return { ok: true };
    }),
});
