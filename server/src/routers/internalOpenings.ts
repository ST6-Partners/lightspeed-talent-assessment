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
import { inboundEmails } from '../db/schema/email.js';
import { emailPostingOpenedExternal, emailApplicationReceived, emailInternalApplicantHR, emailInternalInterestAlert, HIRING_TEAM_INBOX } from '../services/email.js';
import { announceRoleInternally } from '../services/internalAnnounce.js';
import { getInternalReportConfig } from '../services/internalReport.js';
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
      managerEmail: z.string().email().max(300).optional(),
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

      // Fire the sequence: acknowledge the applicant + flag HR (internal → loop in leadership chain).
      const req = (jd as any).reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, (jd as any).reqId) }) : null;
      const jobTitle = jd.jobTitle;
      const department = (req as any)?.department ?? null;

      await emailApplicationReceived({ firstName, lastName, email: input.email, jobTitle }).catch(() => {});
      await emailInternalApplicantHR({ firstName, lastName, email: input.email, jobTitle, currentRole: input.currentRole ?? null }).catch(() => {});

      // Immediately alert the applicant's manager + the standing leadership-awareness list
      // (overcommunicate, no blindside). Manual org-chart entry until HRIS lands.
      const applicantName = `${firstName} ${lastName}`;
      const cfg = await getInternalReportConfig(ctx.db).catch(() => ({ recipients: [] as string[], enabled: false }));
      const leadershipList = (cfg.recipients ?? []).filter((e: string) => e && e.includes('@'));
      const notified: string[] = [];
      if (input.managerEmail) {
        await emailInternalInterestAlert(input.managerEmail, { applicantName, currentRole: input.currentRole ?? null, jobTitle, forManager: true }).catch(() => {});
        notified.push(input.managerEmail);
      }
      for (const to of leadershipList) {
        if (notified.includes(to)) continue;
        await emailInternalInterestAlert(to, { applicantName, currentRole: input.currentRole ?? null, jobTitle, forManager: false }).catch(() => {});
        notified.push(to);
      }
      // Reflect awareness on the candidate record: manager notified => manager aware; store who was looped in.
      try {
        await ctx.db.update(candidates).set({
          managerAware: input.managerEmail ? true : (candidate as any).managerAware,
          leadershipAwareness: notified.length ? Array.from(new Set(notified)).join(', ') : (candidate as any).leadershipAwareness,
          updatedAt: new Date(),
        }).where(eq(candidates.id, candidate.id));
      } catch (err) { console.error('[applyInternal] awareness update failed:', err); }

      // Test-inbox copies so the sequence is verifiable.
      try {
        await ctx.db.insert(inboundEmails).values([
          {
            fromEmail: process.env.EMAIL_FROM ?? 'careers@lightspeedsystems.com', fromName: 'Lightspeed Careers',
            toEmail: input.email, subject: `We received your application — ${jobTitle}`,
            body: `Thanks for your interest in ${jobTitle}. Our team will be in touch.`,
            replyTag: 'application_received', source: 'simulated',
            raw: { kind: 'internal_application_ack', candidateId: candidate.id },
          },
          {
            fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
            toEmail: process.env.HR_EMAIL ?? 'hr@lightspeed.test', subject: `Internal applicant: ${firstName} ${lastName} — ${jobTitle}`,
            body: `${firstName} ${lastName}${input.currentRole ? ` (currently ${input.currentRole})` : ''} expressed interest in ${jobTitle}${department ? ` (${department})` : ''}. Added to the Internal Pipeline — loop in their leadership chain up to ELT.`,
            replyTag: 'internal_applicant_hr', source: 'simulated',
            raw: { kind: 'internal_applicant_hr', candidateId: candidate.id },
          },
          ...(notified.length ? [{
            fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
            toEmail: notified.join(', '), subject: `Internal interest alert sent — ${firstName} ${lastName} (${jobTitle})`,
            body: `Immediate awareness alert sent to ${notified.length} recipient(s): ${notified.join(', ')}. ${input.managerEmail ? 'Includes their manager.' : ''}`,
            replyTag: 'internal_interest_alert', source: 'simulated',
            raw: { kind: 'internal_interest_alert', candidateId: candidate.id, notified },
          }] : []),
        ] as any);
      } catch (err) { console.error('[applyInternal] inbox record failed:', err); }

      trackActivity(ctx.db, null as any, 'express_interest_internal', 'candidates', { candidateId: candidate.id, jdId: input.jdId, notified: notified.length }).catch(() => {});
      return { ok: true, notified: notified.length };
    }),
});
