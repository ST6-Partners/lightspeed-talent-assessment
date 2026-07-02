// ============================================================
// REFERENCES ROUTER — candidate-provided references + outreach.
//
// Flow (per the hiring team): at the finalist stage HR captures the
// references the candidate supplied, the app emails each one a short
// questionnaire via SendGrid, references reply through a tokenized
// link, and the responses feed the reference-check summary. This is
// the traditional consented reference check — no open-web research.
// ============================================================

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { candidates, candidateReferences, jobDescriptions } from '../db/schema/hiring.js';
import { sendEmail } from '../services/email.js';
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

export const referencesRouter = router({
  // ── Protected: manage references for a candidate ─────────
  list: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.candidateReferences.findMany({
        where: eq(candidateReferences.candidateId, input.candidateId),
        orderBy: (t: any, { asc }: any) => [asc(t.createdAt)],
      });
    }),

  add: protectedProcedure
    .input(z.object({
      candidateId: z.string().uuid(),
      name: z.string().min(1).max(200),
      email: z.string().email().max(300),
      relationship: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ref] = await ctx.db.insert(candidateReferences).values({
        candidateId: input.candidateId,
        name: input.name,
        email: input.email,
        relationship: input.relationship ?? null,
        token: randomUUID(),
        status: 'pending',
      }).returning();
      await auditChange(ctx.db, ctx.user.id, input.candidateId, 'candidates', 'update');
      return ref;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(candidateReferences).where(eq(candidateReferences.id, input.id));
      return { ok: true };
    }),

  // Send the questionnaire to every reference that hasn't responded.
  sendRequests: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const jobTitle = await jobTitleFor(ctx.db, candidate.jdId);
      const refs = await ctx.db.query.candidateReferences.findMany({
        where: eq(candidateReferences.candidateId, input.candidateId),
      });

      let sent = 0;
      for (const ref of refs) {
        if (ref.status === 'responded') continue;
        const url = `${appBaseUrl()}/reference/${ref.token}`;
        const subject = `Reference request for ${candidate.firstName} ${candidate.lastName}${jobTitle ? ` — ${jobTitle}` : ''}`;
        const html = `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
            <h2>Reference request</h2>
            <p>Hi ${ref.name},</p>
            <p><strong>${candidate.firstName} ${candidate.lastName}</strong> listed you as a reference for the
            ${jobTitle ? `<strong>${jobTitle}</strong> ` : ''}role at Lightspeed Systems. It takes about two minutes.</p>
            <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Provide your reference</a></p>
            <p style="font-size:12px;color:#666;">If the button doesn't work, paste this link: ${url}</p>
            <p>Thank you,<br/>Lightspeed Systems Recruiting</p>
          </div>`;
        await sendEmail({ to: ref.email, subject, html, templateId: 'reference_request' });
        await ctx.db.update(candidateReferences)
          .set({ status: 'requested', requestedAt: new Date() })
          .where(eq(candidateReferences.id, ref.id));
        sent++;
      }
      trackActivity(ctx.db, ctx.user.id, 'reference_requests_sent', 'candidates', { candidateId: input.candidateId, sent }).catch(() => {});
      return { sent };
    }),

  // ── Public: the reference fills out the questionnaire ─────
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const ref = await ctx.db.query.candidateReferences.findFirst({
        where: eq(candidateReferences.token, input.token),
      });
      if (!ref) throw new TRPCError({ code: 'NOT_FOUND', message: 'This reference link is invalid or has expired.' });
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, ref.candidateId) });
      const jobTitle = await jobTitleFor(ctx.db, candidate?.jdId);
      return {
        referenceName: ref.name,
        relationship: ref.relationship,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'the candidate',
        jobTitle: jobTitle ?? null,
        alreadyResponded: ref.status === 'responded',
      };
    }),

  submitResponse: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      response: z.string().min(1),
      wouldRehire: z.enum(['yes', 'no', 'unsure']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ref = await ctx.db.query.candidateReferences.findFirst({
        where: eq(candidateReferences.token, input.token),
      });
      if (!ref) throw new TRPCError({ code: 'NOT_FOUND', message: 'This reference link is invalid or has expired.' });
      await ctx.db.update(candidateReferences)
        .set({ response: input.response, wouldRehire: input.wouldRehire ?? null, status: 'responded', respondedAt: new Date() })
        .where(eq(candidateReferences.id, ref.id));
      return { ok: true };
    }),
});
