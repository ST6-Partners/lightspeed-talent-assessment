// ============================================================
// INTAKE ROUTER — the intake form (extends job_requisitions with
// hiring team, interview plan, awareness list, and approval setup).
// Slice 1: capture + save + submit. Slice 2 drives the approval flow.
// ============================================================

import { z } from 'zod';
import { eq, desc, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { jobRequisitions } from '../db/schema/hiring.js';
import { interviewPlan, hiringTeam, awarenessList, approvals } from '../db/schema/intake.js';
import { inboundEmails } from '../db/schema/email.js';
import type { DrizzleClient } from '../db.js';
import { jobDescriptions } from '../db/schema/hiring.js';
import { interviewQuestions } from '../db/schema/intake.js';
import { generateRoleJD, generateRoleQuestions } from '../services/ai.js';
import { APPROVER_EMAILS, APPROVER_LABELS, buildApprovalRequestEmail, sendApprovalRequest, buildKickoffEmail, HIRING_TEAM_INBOX, sendEmail } from '../services/email.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

function money(n: number | null | undefined): string { return n != null ? `$${Number(n).toLocaleString()}` : '—'; }

function intakeSummaryRows(req: any): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Department', value: req.department ?? '—' },
    { label: 'Hiring manager', value: req.hiringManager ?? '—' },
    { label: 'Openings', value: String(req.numOpenings ?? 1) },
    { label: 'Priority', value: req.priority ?? '—' },
    { label: 'Employment', value: `${req.employmentType ?? '—'}${req.workArrangement ? ' · ' + req.workArrangement : ''}${req.workArrangement === 'Hybrid' && req.hybridDays != null ? ' (' + req.hybridDays + ' days in office)' : ''}` },
    { label: 'Location', value: req.location || '—' },
    { label: 'Salary range', value: `${money(req.salaryMin)} – ${money(req.salaryMax)}` },
    { label: 'Interview rounds', value: String(req.interviewRounds ?? 1) },
    { label: 'Timeline', value: `${req.timelineTemplate ?? 'standard'}${req.targetOfferDate ? ' · offer by ' + req.targetOfferDate : ''}` },
  ];
  if (req.variableComp) rows.push({ label: 'Variable comp', value: req.variableComp });
  return rows;
}

// Email + test-inbox record for ONE approver (their step's tokenized review link).
async function notifyApprover(db: DrizzleClient, req: any, approval: { id: string; approverRole: string }): Promise<string | null> {
  const to = APPROVER_EMAILS[approval.approverRole] ?? APPROVER_EMAILS.hr;
  const roleLabel = APPROVER_LABELS[approval.approverRole] ?? approval.approverRole;
  const approvalUrl = `${appBaseUrl()}/approve/${approval.id}`;
  const data = { roleLabel, department: req.department, hiringManager: req.hiringManager, approvalUrl, summaryRows: intakeSummaryRows(req) };
  const { subject, text } = buildApprovalRequestEmail(data);
  let error: string | null = null;
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: to, subject, body: text, replyTag: approval.approverRole, source: 'simulated',
      raw: { kind: 'intake_approval', approvalId: approval.id, approvalUrl },
    });
  } catch (err: any) {
    error = `${roleLabel}: ${err?.cause?.message ?? err?.message ?? String(err)}`;
    console.error('[intake] inbox record failed:', err);
  }
  try { await sendApprovalRequest(to, data); } catch (err) { console.error('[intake] send failed:', err); }
  return error;
}

// Fires when the intake is fully approved: assembles the kickoff from the intake
// data and sends it to the hiring team + awareness list (real send to any
// email-like refs), and records a copy in the test inbox.
async function sendKickoff(db: DrizzleClient, req: any, extras?: { jdTitle?: string; questions?: Array<{ category?: string; question: string }>; externalPostDate?: string }): Promise<void> {
  const [team, awareness, rounds] = await Promise.all([
    db.select().from(hiringTeam).where(eq(hiringTeam.reqId, req.id)),
    db.select().from(awarenessList).where(eq(awarenessList.reqId, req.id)),
    db.select().from(interviewPlan).where(eq(interviewPlan.reqId, req.id)).orderBy(asc(interviewPlan.sortOrder)),
  ]);
  const { subject, html, text } = buildKickoffEmail({
    department: req.department, hiringManager: req.hiringManager,
    summaryRows: intakeSummaryRows(req), team, awareness, rounds,
    jdTitle: extras?.jdTitle, questions: extras?.questions, externalPostDate: extras?.externalPostDate,
  });
  // Record one copy into the test inbox (team inbox) so the kickoff is verifiable.
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: HIRING_TEAM_INBOX, subject, body: text, replyTag: 'kickoff', source: 'simulated',
      raw: { kind: 'kickoff', reqId: req.id },
    });
  } catch (err) { console.error('[intake] kickoff inbox record failed:', err); }
  // Real send to any team/awareness refs that look like email addresses.
  const emailLike = [...team.map((t: any) => t.personRef), ...awareness.map((a: any) => a.personRef)]
    .filter((x: string) => /.+@.+\..+/.test(x));
  for (const to of Array.from(new Set(emailLike))) {
    try { await sendEmail({ to, subject, html, templateId: 'intake_kickoff' }); } catch (err) { console.error('[intake] kickoff send failed:', err); }
  }
}

// On final approval: generate a draft JD, generate role interview questions, post
// the role (internal now, external in 3 days), then send the kickoff.
async function runKickoffAndPosting(db: DrizzleClient, req: any): Promise<void> {
  let jdTitle: string | undefined;
  try {
    const jd = await generateRoleJD({
      department: req.department, workArrangement: req.workArrangement,
      location: req.location, salaryMin: req.salaryMin, salaryMax: req.salaryMax,
    });
    jdTitle = jd.jobTitle;
    await db.insert(jobDescriptions).values({
      reqId: req.id, jobTitle: jd.jobTitle, summary: jd.summary,
      responsibilities: jd.responsibilities, requiredQualifications: jd.requiredQualifications,
      preferredQualifications: jd.preferredQualifications, status: 'Draft',
    });
  } catch (err) { console.error('[intake] JD generation failed:', err); }

  let questions: Array<{ category?: string; question: string }> = [];
  try {
    questions = await generateRoleQuestions({ department: req.department, jobTitle: jdTitle ?? `${req.department} Position` });
    await db.insert(interviewQuestions).values({
      reqId: req.id, questions, source: req.questionSource === 'ai_generate' ? 'ai' : 'standard',
    });
  } catch (err) { console.error('[intake] question generation failed:', err); }

  const externalPostDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    await db.update(jobRequisitions).set({ status: 'Open', updatedAt: new Date() }).where(eq(jobRequisitions.id, req.id));
  } catch (err) { console.error('[intake] posting (status Open) failed:', err); }

  await sendKickoff(db, req, { jdTitle, questions, externalPostDate });
}

const RoundInput = z.object({
  roundName: z.string().min(1).max(120),
  lengthMin: z.number().int().optional(),
  format: z.string().max(60).optional(),
});
const PersonInput = z.object({
  personRef: z.string().min(1).max(200),
  roleInProcess: z.string().max(120).optional(),
  roundRef: z.string().max(120).optional(),
});
const AwarenessInput = z.object({
  personRef: z.string().min(1).max(200),
  source: z.enum(['auto', 'manual']).default('manual'),
});

const IntakeInput = z.object({
  // Section 1 — why
  reasonType: z.enum(['backfill', 'new_headcount', 'replacement_diff', 'termination_diff']).optional(),
  roleChangeNote: z.string().optional(),
  reason: z.string().optional(),
  // Section 2 — role
  department: z.string().min(1).max(200),
  hiringManager: z.string().min(1).max(200),
  numOpenings: z.number().int().min(1).default(1),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  // Section 3 — employment & location
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship']).default('Full-Time'),
  location: z.string().max(200).optional(),
  workArrangement: z.enum(['On-site', 'Hybrid', 'Remote']).default('On-site'),
  hybridDays: z.number().int().min(0).max(5).optional(),
  // Section 4 — compensation
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  compBasis: z.array(z.enum(['budget', 'market', 'philosophy'])).default([]),
  variableComp: z.string().optional(),
  // Section 5 — interview structure
  interviewRounds: z.number().int().min(1).max(5).default(1),
  questionSource: z.enum(['standard', 'ai_generate']).default('standard'),
  // Section 6 — team & awareness
  teamAvailabilityConfirmed: z.boolean().default(false),
  // Section 7 — timeline
  timelineTemplate: z.enum(['standard', 'senior', 'custom']).default('standard'),
  targetPostDate: z.string().optional(),
  targetOfferDate: z.string().optional(),
  // child collections
  rounds: z.array(RoundInput).default([]),
  team: z.array(PersonInput).default([]),
  awareness: z.array(AwarenessInput).default([]),
});

const APPROVAL_STEPS = [
  { step: 1, approverRole: 'hiring_manager' },
  { step: 2, approverRole: 'elt' },
  { step: 3, approverRole: 'finance' },
  { step: 4, approverRole: 'hr' },
];

export const intakeRouter = router({
  // Intakes are job_requisitions; list them newest-first.
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.jobRequisitions.findMany({
      orderBy: desc(jobRequisitions.createdAt),
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const req = await ctx.db.query.jobRequisitions.findFirst({
        where: eq(jobRequisitions.id, input.id),
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      const [rounds, team, awareness, approvalRows] = await Promise.all([
        ctx.db.select().from(interviewPlan).where(eq(interviewPlan.reqId, input.id)).orderBy(asc(interviewPlan.sortOrder)),
        ctx.db.select().from(hiringTeam).where(eq(hiringTeam.reqId, input.id)),
        ctx.db.select().from(awarenessList).where(eq(awarenessList.reqId, input.id)),
        ctx.db.select().from(approvals).where(eq(approvals.reqId, input.id)).orderBy(asc(approvals.step)),
      ]);
      return { ...req, rounds, team, awareness, approvals: approvalRows };
    }),

  // Create or update an intake draft, replacing its child rows.
  saveDraft: protectedProcedure
    .input(IntakeInput.extend({ id: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
     try {
      const { id, rounds, team, awareness, ...reqFields } = input;

      const reqValues = {
        ...reqFields,
        compBasis: reqFields.compBasis,
        targetPostDate: reqFields.targetPostDate || null,
        targetOfferDate: reqFields.targetOfferDate || null,
      };

      let reqId: string;
      if (id) {
        const existing = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, id) });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
        await ctx.db.update(jobRequisitions)
          .set({ ...reqValues, updatedAt: new Date() })
          .where(eq(jobRequisitions.id, id));
        reqId = id;
        await auditChange(ctx.db, ctx.user.id, reqId, 'job_requisitions', 'update');
      } else {
        const [created] = await ctx.db.insert(jobRequisitions)
          .values({ ...reqValues, createdBy: ctx.user.id })
          .returning();
        reqId = created.id;
        await auditChange(ctx.db, ctx.user.id, reqId, 'job_requisitions', 'create');
      }

      // Replace child rows.
      await ctx.db.delete(interviewPlan).where(eq(interviewPlan.reqId, reqId));
      if (rounds.length) {
        await ctx.db.insert(interviewPlan).values(
          rounds.map((r, i) => ({ reqId, roundName: r.roundName, lengthMin: r.lengthMin, format: r.format, sortOrder: i })),
        );
      }
      await ctx.db.delete(hiringTeam).where(eq(hiringTeam.reqId, reqId));
      if (team.length) {
        await ctx.db.insert(hiringTeam).values(
          team.map((p) => ({ reqId, personRef: p.personRef, roleInProcess: p.roleInProcess, roundRef: p.roundRef })),
        );
      }
      await ctx.db.delete(awarenessList).where(eq(awarenessList.reqId, reqId));
      if (awareness.length) {
        await ctx.db.insert(awarenessList).values(
          awareness.map((a) => ({ reqId, personRef: a.personRef, source: a.source })),
        );
      }

      trackActivity(ctx.db, ctx.user.id, 'save_intake', 'job_requisitions', { reqId }).catch(() => {});
      return { id: reqId };
     } catch (e: any) {
       const reason = e?.cause?.message ?? e?.message ?? String(e);
       throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: reason });
     }
    }),

  // Submit for approval: validate, move to Pending Approval, seed the approval chain.
  submit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.id) });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });

      const missing: string[] = [];
      if (!req.department) missing.push('department');
      if (!req.hiringManager) missing.push('hiring manager');
      if (req.salaryMin == null || req.salaryMax == null) missing.push('salary range');
      if (req.salaryMin != null && req.salaryMax != null && req.salaryMax < req.salaryMin) missing.push('salary range (max below min)');
      if (!req.teamAvailabilityConfirmed) missing.push('team availability confirmation');
      if (missing.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot submit — missing: ${missing.join(', ')}.` });
      }

      await ctx.db.update(jobRequisitions)
        .set({ status: 'Pending Approval', updatedAt: new Date() })
        .where(eq(jobRequisitions.id, input.id));

      // Seed the sequential approval chain (slice 2 drives it forward).
      // Default mode 'explicit'; step 1 (hiring manager submitting) is auto-approved.
      await ctx.db.delete(approvals).where(eq(approvals.reqId, input.id));
      const insertedApprovals = await ctx.db.insert(approvals).values(
        APPROVAL_STEPS.map((s) => ({
          reqId: input.id,
          step: s.step,
          approverRole: s.approverRole,
          status: s.step === 1 ? 'approved' : 'pending',
          approverRef: s.step === 1 ? req.hiringManager : null,
          actedAt: s.step === 1 ? new Date() : null,
        })),
      ).returning();
const notifyErrors: string[] = [];
      // Sequential: notify ONLY the first pending approver (ELT). Each later
      // approval triggers the next person\'s email, so nobody is emailed before
      // they can act.
      const firstPending = insertedApprovals
        .filter((a) => a.status === 'pending')
        .sort((a, b) => a.step - b.step)[0];
      if (firstPending) {
        const e = await notifyApprover(ctx.db, req, firstPending);
        if (e) notifyErrors.push(e);
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'submit_intake', 'job_requisitions', { reqId: input.id }).catch(() => {});
      return { id: input.id, status: 'Pending Approval', notifyErrors };
    }),

  // Delete an intake/requisition. Child rows (interview_plan, hiring_team,
  // awareness_list, approvals, job_descriptions) cascade via FK; linked
  // candidates are detached (jd_id ON DELETE set null).
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.delete(jobRequisitions).where(eq(jobRequisitions.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'job_requisitions', 'delete');
      trackActivity(ctx.db, ctx.user.id, 'delete_intake', 'job_requisitions', { reqId: input.id }).catch(() => {});
      return { id: input.id };
    }),

  // ── Public, no-login approval via a tokenized link (the approval row id) ──
  approvalView: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid or has expired.' });
      const req = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, target.reqId) });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      const [rounds, team, awareness, chainRows] = await Promise.all([
        ctx.db.select().from(interviewPlan).where(eq(interviewPlan.reqId, target.reqId)).orderBy(asc(interviewPlan.sortOrder)),
        ctx.db.select().from(hiringTeam).where(eq(hiringTeam.reqId, target.reqId)),
        ctx.db.select().from(awarenessList).where(eq(awarenessList.reqId, target.reqId)),
        ctx.db.select().from(approvals).where(eq(approvals.reqId, target.reqId)).orderBy(asc(approvals.step)),
      ]);
      const nextPending = chainRows.find((r) => r.status === 'pending');
      return {
        approvalId: target.id,
        step: target.step,
        roleLabel: APPROVER_LABELS[target.approverRole] ?? target.approverRole,
        stepStatus: target.status,
        isCurrentStep: !!nextPending && nextPending.id === target.id,
        overallStatus: req.status,
        requisition: req,
        rounds, team, awareness,
        chain: chainRows.map((r) => ({ step: r.step, roleLabel: APPROVER_LABELS[r.approverRole] ?? r.approverRole, status: r.status, note: r.note })),
      };
    }),

  approveViaToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid.' });
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, target.reqId)).orderBy(asc(approvals.step));
      const nextPending = rows.find((r) => r.status === 'pending');
      if (!nextPending || nextPending.id !== target.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This step is not currently awaiting your approval (it may already be decided, or an earlier step is still pending).' });
      }
      await ctx.db.update(approvals).set({ status: 'approved', approverRef: 'via approval link', note: input.note ?? target.note, actedAt: new Date() }).where(eq(approvals.id, target.id));
      if (target.approverRole === 'finance') {
        await ctx.db.update(jobRequisitions).set({ financeConfirmed: true, updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
      }
      const stillPending = rows.some((r) => r.id !== target.id && r.status === 'pending');
      if (!stillPending) {
        await ctx.db.update(jobRequisitions).set({ status: 'Approved', updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
        const approvedReq = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, target.reqId) });
        if (approvedReq) await runKickoffAndPosting(ctx.db, approvedReq);
      }
      if (stillPending) {
        const reqRow = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, target.reqId) });
        const upNext = rows.filter((r) => r.id !== target.id && r.status === 'pending').sort((a, b) => a.step - b.step)[0];
        if (reqRow && upNext) await notifyApprover(ctx.db, reqRow, upNext);
      }
      return { ok: true as const, fullyApproved: !stillPending, roleLabel: APPROVER_LABELS[target.approverRole] ?? target.approverRole };
    }),

  rejectViaToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), note: z.string().min(1, 'A reason is required to reject.') }))
    .mutation(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid.' });
      await ctx.db.update(approvals).set({ status: 'rejected', approverRef: 'via approval link', note: input.note, actedAt: new Date() }).where(eq(approvals.id, target.id));
      await ctx.db.update(jobRequisitions).set({ status: 'Draft', updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
      return { ok: true as const, roleLabel: APPROVER_LABELS[target.approverRole] ?? target.approverRole };
    }),

  // Approve the current step in the sequence. Enforces order (must be the
  // lowest pending step). Finance approval sets finance_confirmed; the final
  // approval moves the intake to Approved (slice 3 fires the kickoff here).
  approve: protectedProcedure
    .input(z.object({ reqId: z.string().uuid(), step: z.number().int(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, input.reqId)).orderBy(asc(approvals.step));
      if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'No approval chain — submit the intake first.' });
      const nextPending = rows.find((r) => r.status === 'pending');
      if (!nextPending || nextPending.step !== input.step) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That is not the current pending approval step.' });
      }
      await ctx.db.update(approvals)
        .set({ status: 'approved', approverRef: ctx.user.id, note: input.note ?? nextPending.note, actedAt: new Date() })
        .where(eq(approvals.id, nextPending.id));

      if (nextPending.approverRole === 'finance') {
        await ctx.db.update(jobRequisitions).set({ financeConfirmed: true, updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      }
      const stillPending = rows.some((r) => r.id !== nextPending.id && r.status === 'pending');
      if (!stillPending) {
        await ctx.db.update(jobRequisitions).set({ status: 'Approved', updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
        const approvedReq = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.reqId) });
        if (approvedReq) await runKickoffAndPosting(ctx.db, approvedReq);
      }
      if (stillPending) {
        const reqRow = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.reqId) });
        const upNext = rows.filter((r) => r.id !== nextPending.id && r.status === 'pending').sort((a, b) => a.step - b.step)[0];
        if (reqRow && upNext) await notifyApprover(ctx.db, reqRow, upNext);
      }
      await auditChange(ctx.db, ctx.user.id, input.reqId, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'approve_intake', 'job_requisitions', { reqId: input.reqId, step: input.step }).catch(() => {});
      return { id: input.reqId, fullyApproved: !stillPending };
    }),

  // Reject a step: records the note and sends the intake back to Draft.
  // Re-submitting re-seeds the chain from the start.
  reject: protectedProcedure
    .input(z.object({ reqId: z.string().uuid(), step: z.number().int(), note: z.string().min(1, 'A reason is required to reject.') }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, input.reqId)).orderBy(asc(approvals.step));
      const target = rows.find((r) => r.step === input.step);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.update(approvals)
        .set({ status: 'rejected', approverRef: ctx.user.id, note: input.note, actedAt: new Date() })
        .where(eq(approvals.id, target.id));
      await ctx.db.update(jobRequisitions).set({ status: 'Draft', updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      await auditChange(ctx.db, ctx.user.id, input.reqId, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'reject_intake', 'job_requisitions', { reqId: input.reqId, step: input.step }).catch(() => {});
      return { id: input.reqId };
    }),
});
