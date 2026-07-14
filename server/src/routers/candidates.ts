import { resolveDeptWorkSample } from '../services/workSampleResolver.js';
// ============================================================
// CANDIDATES ROUTER — CRUD + stage management + email triggers
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions, emailLog } from '../db/schema/hiring.js';
import { inboundEmails } from '../db/schema/email.js';
import { offerApprovals } from '../db/schema/offerApprovals.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { valueReviews, candidateValueScores, companyValues } from '../db/schema/values.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';
import { logDecision } from '../services/decisionLog.js';
import { analyzeInterviewTranscript } from '../services/ai.js';
import { processInterviewFeedback } from '../services/interviewFeedback.js';
import { seedRoundsFromPlan, autofillSampleRounds } from '../services/interviewRounds.js';
import { sendAssessment, getScores } from '../services/criteriaCorp.js';
import {
  emailApplicationReceived,
  emailNewApplicationHR,
  emailInternalInterestAlert,
  dispatchStageEmail,
  emailInterviewerQuestions,
  sendEmail,
  emailOfferLetter,
} from '../services/email.js';
import { generateInterviewQuestions } from '../services/ai.js';
import { screenResumeRequirements } from '../services/ai.js';
import { scoreSkillsFit } from '../services/ai.js';
import { computeEppScans, ingestEppResults } from '../services/eppScans.js';
import { draftTransitionPlan } from '../services/ai.js';
import { renderOfferLetter, renderInternalOfferLetter, STANDARD_OFFER_CLAUSES, STANDARD_INTERNAL_OFFER_CLAUSES, type OfferLetterInput, type InternalOfferLetterInput } from '../services/offerLetter.js';
import { createOfferAgreement } from '../services/adobeSign.js';
import { getInternalReportConfig, setInternalReportConfig } from '../services/internalReport.js';
import { applyAssessmentDecision } from '../services/assessmentDecision.js';
import { seedCandidateResume, seedAssessmentResults, simulateUpstreamScores } from '../services/postAssessmentReview.js';
import { computeHiringAlerts } from '../services/hiring-alerts.js';
import { walkLeadershipChain } from '../services/orgChain.js';
import { employees } from '../db/schema/employees.js';

const STAGES = [
  'Applied',
  'Assessment',
  'Values Review',
  'Work Sample',
  'Interview Scheduled',
  'Interviewed',
  'Offered',
  'Hired',
  'Rejected',
] as const;

type Stage = typeof STAGES[number];

const CandidateInput = z.object({
  jdId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(300),
  phone: z.string().max(50).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  resumeUrl: z.string().url().optional().or(z.literal('')),
  source: z.string().max(100).optional(),
  notes: z.string().optional(),
  isInternal: z.boolean().optional(),
  internalEmployee: z.string().max(200).optional(),
});

// Helper: fetch job title for email context
function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

async function getJobTitle(db: any, jdId: string | null | undefined): Promise<string | undefined> {
  if (!jdId) return undefined;
  const jd = await db.query.jobDescriptions.findFirst({
    where: eq(jobDescriptions.id, jdId),
  });
  return jd?.jobTitle;
}

// Build the offer-letter input by pulling defaults from the requisition (intake
// data) and letting explicit inputs override. So HR only confirms the salary
// figure and start date; everything else flows from intake.
async function buildOfferInput(db: any, input: any): Promise<OfferLetterInput> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
  if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const req = jd?.reqId
    ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
    : null;

  const min = req?.salaryMin ?? null;
  const max = req?.salaryMax ?? null;
  const suggested = (min != null && max != null) ? Math.round((min + max) / 2) : (max ?? min ?? null);
  const arrangement = req?.workArrangement && req.workArrangement !== 'On-site'
    ? `${req.workArrangement}${req.hybridDays ? ` (${req.hybridDays} days)` : ''}`
    : null;
  const location = [req?.location, arrangement].filter(Boolean).join(' \u00b7 ') || null;
  const targetStart = req?.targetStartDate
    ? new Date(req.targetStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: input.jobTitle || jd?.jobTitle || 'the role',
    department: input.department ?? req?.department ?? null,
    reportsTo: input.reportsTo ?? req?.hiringManager ?? null,
    employmentType: input.employmentType ?? req?.employmentType ?? 'Full-Time',
    baseSalary: input.baseSalary ?? suggested ?? null,
    variableComp: input.variableComp ?? (req as any)?.variableComp ?? null,
    startDate: input.startDate ?? targetStart ?? null,
    location: input.location ?? location ?? null,
    legalClauses: input.legalClauses,
    addendum: input.addendum ?? [],
  };
}

// Build the INTERNAL-move offer input. New-role defaults come from the
// requisition/intake (same source as the external letter); current-role
// comp is HR-entered (HRIS integration deferred). Deterministic, no AI.
async function buildInternalOfferInput(db: any, input: any): Promise<InternalOfferLetterInput> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
  if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const req = jd?.reqId
    ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
    : null;

  const min = (req as any)?.salaryMin ?? null;
  const max = (req as any)?.salaryMax ?? null;
  const suggested = (min != null && max != null) ? Math.round((min + max) / 2) : (max ?? min ?? null);

  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    effectiveDate: input.effectiveDate ?? null,
    comp: {
      // Current role (HR-entered; no intake source)
      currentTitle: input.currentTitle ?? null,
      currentBaseSalary: input.currentBaseSalary ?? null,
      currentBonus: input.currentBonus ?? null,
      currentManager: input.currentManager ?? null,
      currentDepartment: input.currentDepartment ?? null,
      currentStipends: input.currentStipends ?? null,
      // New role (prefilled from intake, HR can override)
      newTitle: input.newTitle ?? jd?.jobTitle ?? 'the role',
      newBaseSalary: input.newBaseSalary ?? suggested ?? null,
      newBonus: input.newBonus ?? null,
      newManager: input.newManager ?? (req as any)?.hiringManager ?? null,
      newDepartment: input.newDepartment ?? (req as any)?.department ?? null,
      newStipends: input.newStipends ?? null,
    },
    legalClauses: input.legalClauses,
    addendum: input.addendum ?? [],
  };
}

function escHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Deliver a finalized external offer to the candidate: email + test-inbox copy
// + advance to Offered + audit/activity. Shared by the direct send path and the
// hiring-manager sign-off path so the two can't drift. `userId` is the acting
// user (the recruiter); it may be null when triggered from a tokenized link.
async function deliverOfferToCandidate(db: any, userId: string | null, candidate: any, offer: OfferLetterInput): Promise<{ html: string; jobTitle: string }> {
  const jobTitle = offer.jobTitle;
  const letterHtml = renderOfferLetter(offer);

  await emailOfferLetter({ to: candidate.email, firstName: candidate.firstName, jobTitle, letterHtml }).catch(() => {});

  const offerSubject = `Your offer from Lightspeed Systems${jobTitle ? ` \u2014 ${jobTitle}` : ''}`;
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: candidate.email,
      subject: offerSubject,
      body: letterHtml,
      replyTag: 'offer',
      source: 'simulated',
      raw: { kind: 'offer_letter', candidateId: candidate.id },
    });
  } catch (err) {
    console.error('[offer] inbox record failed:', err);
  }

  if (candidate.currentStage !== 'Offered' && candidate.currentStage !== 'Hired' && candidate.currentStage !== 'Rejected') {
    await db.update(candidates).set({ currentStage: 'Offered', updatedAt: new Date() }).where(eq(candidates.id, candidate.id));
    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id,
      fromStage: candidate.currentStage,
      toStage: 'Offered',
      changedBy: userId,
      reason: 'External offer letter sent',
    });
  }

  if (userId) {
    await auditChange(db, userId, candidate.id, 'candidates', 'update');
    trackActivity(db, userId, 'send_offer', 'candidates', { candidateId: candidate.id }).catch(() => {});
  }
  return { html: letterHtml, jobTitle };
}

async function deliverInternalOfferToCandidate(db: any, userId: string | null, candidate: any, offer: InternalOfferLetterInput): Promise<{ html: string; newTitle: string }> {
  const newTitle = offer.comp.newTitle;
  const letterHtml = renderInternalOfferLetter(offer);
  await emailOfferLetter({ to: candidate.email, firstName: candidate.firstName, jobTitle: newTitle, letterHtml }).catch(() => {});
  const offerSubject = `Your internal offer from Lightspeed Systems${newTitle ? ` — ${newTitle}` : ''}`;
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: candidate.email,
      subject: offerSubject,
      body: letterHtml,
      replyTag: 'internal_offer',
      source: 'simulated',
      raw: { kind: 'internal_offer_letter', candidateId: candidate.id },
    });
  } catch (err) { console.error('[internal-offer] inbox record failed:', err); }
  if (candidate.currentStage !== 'Offered' && candidate.currentStage !== 'Hired' && candidate.currentStage !== 'Rejected') {
    await db.update(candidates).set({ currentStage: 'Offered', updatedAt: new Date() }).where(eq(candidates.id, candidate.id));
    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id, fromStage: candidate.currentStage, toStage: 'Offered',
      changedBy: userId, reason: 'Internal offer letter sent',
    });
  }
  if (userId) {
    await auditChange(db, userId, candidate.id, 'candidates', 'update');
    trackActivity(db, userId, 'send_internal_offer', 'candidates', { candidateId: candidate.id }).catch(() => {});
  }
  return { html: letterHtml, newTitle };
}

// ── Multi-level offer approval chain ─────────────────────────────────────
// The offer routes sequentially through the hiring manager and every manager
// above them in the reporting line (employees.managerEmail). Each approver
// signs off in turn; the letter reaches the candidate only after the FINAL
// approver signs off. Any approver can send it back, which halts the chain
// and returns it to the recruiter. (An empty chain = the pre-0050 legacy
// single-manager gate, still handled by offerApprovalDecide.)
type OfferApprovalStep = {
  order: number;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'sent_back';
  actedName?: string | null;
  note?: string | null;
  decidedAt?: string | null;
};

async function buildOfferApproverChain(
  db: any,
  managerName: string,
  managerEmail: string,
): Promise<OfferApprovalStep[]> {
  const steps: OfferApprovalStep[] = [
    { order: 0, name: managerName || 'Hiring Manager', email: managerEmail, status: 'pending' },
  ];
  // Walk up the org chart from the hiring manager; each manager above becomes
  // the next approval step. walkLeadershipChain de-dupes and caps depth.
  const above = await walkLeadershipChain(db, managerEmail);
  let order = 1;
  for (const email of above) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.email, email) });
    steps.push({ order: order++, name: emp?.name ?? email, email, status: 'pending' });
  }
  return steps;
}

async function notifyOfferApprover(
  db: any,
  row: { id: string; payload: any },
  chain: OfferApprovalStep[],
  stepIndex: number,
  candidate: { id?: string; firstName: string; lastName: string },
  kind: 'external' | 'internal',
): Promise<void> {
  const step = chain[stepIndex];
  if (!step) return;
  const payload: any = row.payload;
  const roleLabel = kind === 'internal'
    ? (payload?.comp?.newTitle ?? 'the role')
    : (payload?.jobTitle ?? 'the role');
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const letterHtml = kind === 'internal'
    ? renderInternalOfferLetter(payload as InternalOfferLetterInput)
    : renderOfferLetter(payload as OfferLetterInput);
  const approvalUrl = `/offer-approval/${row.id}`;
  const total = chain.length;
  const isFinal = stepIndex === total - 1;
  const stepLabel = `approval ${stepIndex + 1} of ${total}`;
  const recipientNoun = kind === 'internal' ? 'employee' : 'candidate';
  const priorLine = stepIndex > 0
    ? `<p style="color:#4b5563;font-size:13px">Already signed off by: ${chain.slice(0, stepIndex).map((s) => escHtml(s.actedName || s.name)).join(', ')}.</p>`
    : '';
  const nextClause = isFinal
    ? ` As the final approver, your sign-off sends the offer to the ${recipientNoun}.`
    : ' Signing off passes it to the next approver in the chain.';
  const body = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">`
    + `<p><strong>${escHtml(candidateName)}</strong> has reached the offer stage for <strong>${escHtml(roleLabel)}</strong>. `
    + `You are ${stepLabel} in the offer approval chain.${nextClause} Please review the draft offer letter below, edit anything that needs fixing, then sign off — or send it back.</p>`
    + priorLine
    + `<p><a href="${approvalUrl}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Open, review &amp; sign off</a></p>`
    + `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>`
    + letterHtml + `</div>`;
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: step.email,
      subject: `Offer approval needed (${stepLabel}): ${candidateName} — ${roleLabel}`,
      body,
      replyTag: 'offer_approval',
      source: 'simulated',
      raw: { kind: 'offer_approval', approvalId: row.id, candidateId: candidate.id, approvalUrl, step: stepIndex },
    });
  } catch (err) { console.error('[offer-approval] inbox record failed:', err); }
}

export const candidatesRouter = router({
  // Timeline / SLA alerts (flowchart node X): stalled candidates + overdue reqs.
  // Computed on the fly — no stored state.
  timelineAlerts: protectedProcedure
    .query(async ({ ctx }) => {
      return computeHiringAlerts(ctx.db);
    }),

  list: protectedProcedure
    .input(z.object({
      jdId: z.string().uuid().optional(),
      stage: z.enum(STAGES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.candidates.findMany({
        orderBy: desc(candidates.createdAt),
      });
      let result = rows;
      if (input?.jdId) result = result.filter((c) => c.jdId === input.jdId);
      if (input?.stage) result = result.filter((c) => c.currentStage === input.stage);
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      return candidate;
    }),

  getStageHistory: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.candidateStageHistory.findMany({
        where: eq(candidateStageHistory.candidateId, input.candidateId),
        orderBy: desc(candidateStageHistory.createdAt),
      });
    }),

  create: protectedProcedure
    .input(CandidateInput.extend({ needsSponsorship: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { needsSponsorship, ...candidateData } = input;
      const [candidate] = await ctx.db.insert(candidates).values(candidateData).returning();

      // Log initial stage to history
      await ctx.db.insert(candidateStageHistory).values({
        candidateId: candidate.id,
        fromStage: null,
        toStage: 'Applied',
        changedBy: ctx.user.id,
        reason: 'Application received',
      });

      const jobTitle = await getJobTitle(ctx.db, candidateData.jdId);

      // Sponsorship knockout: the candidate checked "requires international
      // sponsorship" on the application -> auto-reject on submit. This is the
      // hook the Greenhouse intake maps its sponsorship answer to.
      if (needsSponsorship) {
        await ctx.db.update(candidates)
          .set({
            currentStage: 'Rejected',
            rejectionReason: 'Requires international sponsorship, which Lightspeed does not offer.',
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, candidate.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: candidate.id,
          fromStage: 'Applied',
          toStage: 'Rejected',
          changedBy: ctx.user.id,
          reason: 'Auto-declined on application: requires international sponsorship (not offered).',
        });
        // SendGrid rejection email to the candidate.
        dispatchStageEmail('Rejected', 'Applied', {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});

        await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'create');
        trackActivity(ctx.db, ctx.user.id, 'create_candidate', 'candidates', { candidateId: candidate.id, autoDeclined: 'sponsorship' }).catch(() => {});
        return { ...candidate, currentStage: 'Rejected' as const };
      }

      // Seed the resume at application time. CCAT + EPP come later, when the
      // candidate reaches the Assessment stage.
      await seedCandidateResume(ctx.db, candidate.id, candidate).catch((err) => console.error('[create] seed resume failed:', err));

      // Normal path — fire emails (non-blocking)
      emailApplicationReceived({ ...candidateData, jobTitle }).catch(() => {});
      emailNewApplicationHR({ ...candidateData, jobTitle }).catch(() => {});

      await auditChange(ctx.db, ctx.user.id, candidate.id, 'candidates', 'create');
      trackActivity(ctx.db, ctx.user.id, 'create_candidate', 'candidates', { candidateId: candidate.id }).catch(() => {});
      return candidate;
    }),

  // Hard-delete a candidate (build/testing convenience). Child rows (EPP scores,
  // stage history, references, value reviews, offer approvals) cascade on delete.
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.delete(candidates).where(eq(candidates.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'delete');
      trackActivity(ctx.db, ctx.user.id, 'delete_candidate', 'candidates', { candidateId: input.id }).catch(() => {});
      return { id: input.id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(CandidateInput.partial()).extend({
      ccatScore: z.number().int().optional(),
      eppValuesMatchScore: z.number().int().optional(),
      workSampleScore: z.number().int().optional(),
      resumeReviewScore: z.number().int().optional(),
      resumeReviewNotes: z.string().optional(),
      valuesMatchNotes: z.string().optional(),
      interviewerName: z.string().max(200).optional(),
      interviewerEmail: z.string().email().max(300).optional(),
      zoomMeetingId: z.string().max(100).optional(),
      managerAware: z.boolean().optional(),
      leadershipAwareness: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [candidate] = await ctx.db.update(candidates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(candidates.id, id))
        .returning();

      // If a CCAT score was just set/changed, run the automatic pass/fail decision.
      if (input.ccatScore !== undefined) {
        await applyAssessmentDecision(ctx.db, id);
      }

      await auditChange(ctx.db, ctx.user.id, id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'update_candidate', 'candidates', { candidateId: id }).catch(() => {});
      return candidate;
    }),

  // Advance a candidate to the next stage
  advanceStage: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      toStage: z.enum(STAGES),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.currentStage === input.toStage) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Candidate is already in that stage' });
      }

      // Direction: forward = advancing to a later stage. Backward moves are a
      // quiet correction (no emails, no re-running the assessment review).
      const STAGE_SEQ = STAGES as readonly string[];
      const fwd = STAGE_SEQ.indexOf(input.toStage) > STAGE_SEQ.indexOf(existing.currentStage);

      // Entering the Assessment stage -> the candidate's CCAT + EPP results land
      // (simulates Criteria returning scores). Resume was seeded at application.
      if (input.toStage === 'Assessment') {
        await seedAssessmentResults(ctx.db, input.id, existing).catch((err) => console.error('[advance] seed assessment results failed:', err));
      }

      // Advancing a candidate OUT of Assessment runs the automatic review (EPP +
      // company-values + resume gate) — the same decision the CCAT-completion path
      // makes — instead of a plain stage move. Needs a CCAT score (seeded on create).
      if (fwd && existing.currentStage === 'Assessment' && existing.ccatScore != null) {
        try {
          await applyAssessmentDecision(ctx.db, input.id);
        } catch (err) {
          console.error('[advance] assessment review failed:', err);
        }
        const reviewed = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
        await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
        trackActivity(ctx.db, ctx.user.id, 'advance_stage_review', 'candidates', { candidateId: input.id }).catch(() => {});
        return reviewed;
      }

      // On a forward move, backfill simulated scores for the upstream steps the
      // candidate has passed (test data) so a hand-advanced candidate still shows a
      // work-sample / resume-review score. Only fills nulls.
      const backfill = fwd ? simulateUpstreamScores(existing, input.toStage) : {};
      const [candidate] = await ctx.db.update(candidates)
        .set({ currentStage: input.toStage, ...backfill, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();

      // Audit trail
      await ctx.db.insert(candidateStageHistory).values({
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: input.toStage,
        changedBy: ctx.user.id,
        reason: input.reason,
      });

      // Phase 2 — record the manual human stage change in the decision log.
      await logDecision(ctx.db, {
        candidateId: input.id,
        decisionType: 'manual_stage_change',
        outcome: fwd ? 'advanced' : 'moved',
        decidedByType: 'human',
        decidedBy: ctx.user.id,
        reason: input.reason || `Manually moved from ${existing.currentStage} to ${input.toStage}.`,
        inputs: { fromStage: existing.currentStage, toStage: input.toStage, direction: fwd ? 'forward' : 'backward' },
      });

      // Forward-only side effects: stage emails, work-sample link, interviewer questions.
      if (fwd) {
      const jobTitle = await getJobTitle(ctx.db, existing.jdId);
      const jd = existing.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, existing.jdId) })
        : null;
      // Auto-generate + send the work-sample link the moment the candidate
      // reaches the Work Sample stage (i.e. passed the assessment). No manual step.
      let workSampleUrl: string | undefined;
      let workSampleInstructions: string | undefined = jd?.workSampleInstructions ?? undefined;
      if (input.toStage === 'Work Sample') {
        const token = (existing as any).workSampleToken ?? randomUUID();
        if (!(existing as any).workSampleToken) {
          await ctx.db.update(candidates)
            .set({ workSampleToken: token, updatedAt: new Date() })
            .where(eq(candidates.id, input.id));
        }
        workSampleUrl = `${appBaseUrl()}/work-sample/${token}`;
        // Pull the department's work sample from the Work Sample library.
        const resolved = await resolveDeptWorkSample(ctx.db, existing);
        if (resolved) {
          workSampleInstructions =
            `<strong>${resolved.title}</strong><br/><br/>` + resolved.instructions.replace(/\n/g, '<br/>');
        }
      }

      dispatchStageEmail(input.toStage, existing.currentStage, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        jobTitle,
        workSampleInstructions,
        workSampleUrl,
        interviewerName: (existing as any).interviewerName,
        interviewerEmail: (existing as any).interviewerEmail,
      }).catch(() => {});

      // When advancing to Interview Scheduled:
      // 1. Generate tailored interview questions (AI)
      // 2. Email questions to the interviewer
      // Testing helper: when a candidate reaches Interviewed, auto-populate sample
      // interview transcripts + feedback so the app can be exercised without pasting
      // a transcript per candidate. No-op once real AI (ANTHROPIC_API_KEY) is set.
      if (input.toStage === 'Interviewed') {
        autofillSampleRounds(input.id).catch((err) => console.error('[advance] autofill sample rounds failed:', err));
      }

      if (input.toStage === 'Interview Scheduled') {
        // Auto-create the per-round interview records from the role's plan
        // (idempotent — no-op if rounds already exist or no plan is defined).
        seedRoundsFromPlan(input.id).catch((err) => console.error('[advance] auto-seed interview rounds failed:', err));
        (async () => {
          try {
            // Pull assessment data to tailor questions: EPP per-trait percentiles,
            // company-values per-value scores, CCAT, and resume review.
            const eppTraits = await ctx.db
              .select({ trait: candidateEppScores.trait, percentile: candidateEppScores.percentile })
              .from(candidateEppScores)
              .where(eq(candidateEppScores.candidateId, input.id));
            let valueScores: Array<{ value: string; score: number }> = [];
            const latestReview = (await ctx.db
              .select({ id: valueReviews.id })
              .from(valueReviews)
              .where(eq(valueReviews.candidateId, input.id))
              .orderBy(desc(valueReviews.reviewedAt))
              .limit(1))[0];
            if (latestReview) {
              valueScores = await ctx.db
                .select({ value: companyValues.name, score: candidateValueScores.score })
                .from(candidateValueScores)
                .innerJoin(companyValues, eq(candidateValueScores.valueId, companyValues.id))
                .where(eq(candidateValueScores.reviewId, latestReview.id));
            }
            const questions = await generateInterviewQuestions({
              firstName: existing.firstName,
              lastName: existing.lastName,
              jobTitle: jobTitle ?? undefined,
              eppProfile: (existing as any).eppProfile,
              eppValuesMatchScore: (existing as any).eppValuesMatchScore,
              eppTraits,
              companyValuesMatchScore: (existing as any).companyValuesMatchScore,
              companyValuesNotes: (existing as any).companyValuesNotes,
              valueScores,
              resumeReviewNotes: (existing as any).resumeReviewNotes,
              resumeReviewScore: (existing as any).resumeReviewScore,
              workSampleScore: (existing as any).workSampleScore,
              ccatScore: (existing as any).ccatScore,
            });

            // Store questions on candidate record
            await ctx.db.update(candidates)
              .set({ interviewQuestions: questions, updatedAt: new Date() } as any)
              .where(eq(candidates.id, input.id));

            // Email questions to the interviewer (fallback to HR so they never get lost).
            await emailInterviewerQuestions({
              interviewerEmail: (existing as any).interviewerEmail || process.env.HR_EMAIL || 'jade.friedman@lsscorp.net',
              interviewerName: (existing as any).interviewerName ?? 'Interviewer',
              candidateFirstName: existing.firstName,
              candidateLastName: existing.lastName,
              jobTitle: jobTitle ?? 'the role',
              questions,
            });
          } catch (err) {
            console.error('[AI] Interview question generation failed:', err);
          }
        })();
      }

      } // end forward-only side effects

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'advance_stage', 'candidates', {
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: input.toStage,
      }).catch(() => {});

      return candidate;
    }),

  // Reject a candidate
  reject: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.currentStage === 'Rejected') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Candidate is already rejected' });
      }

      const [candidate] = await ctx.db.update(candidates)
        .set({ currentStage: 'Rejected', rejectionReason: input.reason, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();

      await ctx.db.insert(candidateStageHistory).values({
        candidateId: input.id,
        fromStage: existing.currentStage,
        toStage: 'Rejected',
        changedBy: ctx.user.id,
        reason: input.reason,
      });

      // Phase 2 — record the manual human rejection in the decision log.
      await logDecision(ctx.db, {
        candidateId: input.id,
        decisionType: 'manual_stage_change',
        outcome: 'rejected',
        decidedByType: 'human',
        decidedBy: ctx.user.id,
        reason: input.reason,
        inputs: { fromStage: existing.currentStage, toStage: 'Rejected' },
      });

      // Fire rejection email (non-blocking)
      const jobTitle = await getJobTitle(ctx.db, existing.jdId);
      dispatchStageEmail('Rejected', existing.currentStage, {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        jobTitle,
      }).catch(() => {});

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'reject_candidate', 'candidates', { candidateId: input.id }).catch(() => {});
      return candidate;
    }),

  // Mark assessment as sent (called when CCAT link is dispatched)
  markAssessmentSent: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({ assessmentSentAt: new Date(), updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),

  // Screen a resume against the job's REQUIRED qualifications only.
  // Flags missing requirements. Does NOT change stage or reject.
  // Resume screen = decision gate.
  //  - needs international sponsorship  -> auto-reject (knockout)
  //  - missing any REQUIRED qualification -> auto-reject
  //  - all required met                 -> move forward one stage
  // PREFERRED qualifications are "nice-to-haves": never affect the decision;
  // any missing ones are recorded as a note for the hiring manager.
  screenResume: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      resumeText: z.string().min(1),
      needsSponsorship: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const required = ((jd as any)?.requiredQualifications ?? '') as string;
      const preferred = ((jd as any)?.preferredQualifications ?? '') as string;
      const jobTitle = jd?.jobTitle ?? undefined;

      // Screen against must-haves and nice-to-haves separately.
      const requirements = await screenResumeRequirements(input.resumeText, required);
      const niceToHaves = await screenResumeRequirements(input.resumeText, preferred);

      // Build the hiring-manager note.
      const noteParts: string[] = [];
      if (input.needsSponsorship) noteParts.push('KNOCKOUT: requires international sponsorship (not offered).');
      noteParts.push(
        requirements.totalCount
          ? `Requirements: ${requirements.metCount}/${requirements.totalCount} met.`
          : 'No required qualifications defined on this job description.',
      );
      if (requirements.missing.length) noteParts.push(`Missing required: ${requirements.missing.join('; ')}.`);
      if (niceToHaves.missing.length) {
        noteParts.push(`Nice-to-haves missing (FYI, not a dealbreaker): ${niceToHaves.missing.join('; ')}.`);
      } else if (niceToHaves.totalCount) {
        noteParts.push('All nice-to-haves met.');
      }
      const notes = noteParts.join(' ');

      // Decide.
      const terminal = candidate.currentStage === 'Hired' || candidate.currentStage === 'Rejected';
      let decision: 'rejected' | 'advanced' | 'flagged' = 'flagged';
      let reason = '';
      let movedToStage: string | null = null;

      // The requirement reject/advance is only trusted when the REAL AI screened
      // the resume. Without the AI key the keyword fallback is advisory only, so
      // we flag instead of auto-deciding. The sponsorship knockout is a direct
      // yes/no, so it always acts.
      const trustworthy = requirements.mode === 'ai';

      if (input.needsSponsorship) {
        decision = 'rejected';
        reason = 'Requires international sponsorship, which Lightspeed does not offer.';
      } else if (!trustworthy) {
        decision = 'flagged';
        reason = 'Advisory only — set the AI key (ANTHROPIC_API_KEY) for the resume gate to auto-decide.';
      } else if (requirements.missing.length > 0) {
        decision = 'flagged';
        reason = `Missing required qualification(s): ${requirements.missing.join('; ')} — flagged for human review (not auto-rejected).`;
      } else {
        decision = 'advanced';
      }

      // Persist the note regardless of the decision.
      await ctx.db.update(candidates)
        .set({ resumeReviewNotes: notes, updatedAt: new Date() })
        .where(eq(candidates.id, input.id));

      // Apply the stage change (skip if already Hired/Rejected).
      const STAGE_ORDER = STAGES as readonly string[];
      const idx = STAGE_ORDER.indexOf(candidate.currentStage);

      if (!terminal && decision === 'rejected') {
        await ctx.db.update(candidates)
          .set({ currentStage: 'Rejected', rejectionReason: reason, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id,
          fromStage: candidate.currentStage,
          toStage: 'Rejected',
          changedBy: ctx.user.id,
          reason,
        });
        movedToStage = 'Rejected';
        await dispatchStageEmail('Rejected', candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      } else if (!terminal && decision === 'advanced' && idx >= 0 && idx <= 3) {
        // Advance one stage (only through Values Review; never auto-jump interview+).
        const nextStage = STAGE_ORDER[idx + 1];
        await ctx.db.update(candidates)
          .set({ currentStage: nextStage as any, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id,
          fromStage: candidate.currentStage,
          toStage: nextStage as any,
          changedBy: ctx.user.id,
          reason: 'Resume screen passed: all required qualifications met',
        });
        movedToStage = nextStage;
        await dispatchStageEmail(nextStage, candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      } else if (decision === 'advanced') {
        // Passed, but not in an early stage (or terminal): record only, no stage change.
        decision = 'flagged';
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'screen_resume', 'candidates', { candidateId: input.id, decision }).catch(() => {});

      return { decision, reason, movedToStage, requirements, niceToHaves, notes };
    }),

  // ── COMBINED SCREEN (resume + values + skills) ─────────────
  // One automated screen at the 200 -> 20 gate. Runs three signals in a single
  // pass and returns ONE recommendation:
  //   • Requirements gate (must-haves + sponsorship) — the ONLY hard auto-reject,
  //     and only when the real AI screened (keyword fallback is advisory).
  //   • Skills fit (graded 0-100) — decision support, never a sole rejecter.
  //   • Values / EPP match (graded 0-100) — decision support.
  // Composite = average of the available graded signals. Recommendation:
  //   reject (hard gate) | advance (requirements met + composite >= threshold)
  //   | review (anything advisory / below bar / EPP not yet on file).
  runScreen: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      resumeText: z.string().min(1),
      needsSponsorship: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const required = ((jd as any)?.requiredQualifications ?? '') as string;
      const preferred = ((jd as any)?.preferredQualifications ?? '') as string;
      const jobTitle = jd?.jobTitle ?? undefined;

      // 1) Requirements gate (must-haves + nice-to-haves).
      const requirements = await screenResumeRequirements(input.resumeText, required);
      const niceToHaves = await screenResumeRequirements(input.resumeText, preferred);

      // 2) Skills fit (graded).
      const skills = await scoreSkillsFit(input.resumeText, {
        jobTitle,
        summary: (jd as any)?.summary ?? null,
        responsibilities: (jd as any)?.responsibilities ?? null,
        requiredQualifications: required,
        preferredQualifications: preferred,
      });

      // 3) EPP scans — two EPP-derived signals from the candidate's real
      //    12-trait results: overall EPP match + company-values match.
      const eppScans = await computeEppScans(ctx.db, input.id);
      const eppMatch = eppScans.eppMatch;                     // overall EPP strength
      const companyValuesMatch = eppScans.companyValuesMatch; // Lightspeed company-values fit

      // Composite = average of the role-fit signals available: skills fit +
      // company-values match. (EPP match is shown but not folded into the gate.)
      const graded: number[] = [skills.score];
      if (companyValuesMatch != null) graded.push(companyValuesMatch);
      const composite = Math.round(graded.reduce((a, b) => a + b, 0) / graded.length);

      // Trust the auto-decision only when the REAL AI produced both text signals.
      const trustworthy = requirements.mode === 'ai' && skills.mode === 'ai';
      const ADVANCE_THRESHOLD = 65;

      // Decide.
      let decision: 'rejected' | 'advanced' | 'review' = 'review';
      let recommendation = '';
      let reason = '';
      if (input.needsSponsorship) {
        decision = 'rejected';
        reason = 'Requires international sponsorship, which Lightspeed does not offer.';
      } else if (requirements.mode === 'ai' && requirements.missing.length > 0) {
        decision = 'review';
        reason = `Missing required qualification(s): ${requirements.missing.join('; ')} — flagged for human review (not auto-rejected).`;
      } else if (!trustworthy) {
        decision = 'review';
        reason = 'Advisory only — set the AI key (ANTHROPIC_API_KEY) for the screen to auto-decide.';
      } else if (composite >= ADVANCE_THRESHOLD) {
        decision = 'advanced';
      } else {
        decision = 'review';
        reason = `Requirements met, but combined screen score ${composite}/100 is below the ${ADVANCE_THRESHOLD} bar — needs a human look.`;
      }
      recommendation = decision;

      // Combined summary + notes.
      const summaryParts = [
        requirements.summary,
        skills.summary,
        eppScans.hasEpp
          ? `EPP match: ${eppMatch}/100. Company-values match: ${companyValuesMatch}/100 (across ${eppScans.scoredValues} values).`
          : 'EPP + company-values match: no EPP results on file yet.',
        `Combined screen score: ${composite}/100. Recommendation: ${decision}.`,
      ];
      if (niceToHaves.missing.length) summaryParts.push(`Nice-to-haves missing (FYI): ${niceToHaves.missing.join('; ')}.`);
      const screenSummary = summaryParts.join(' ');

      // Persist the scores + combined result (regardless of stage move).
      await ctx.db.update(candidates).set({
        resumeReviewScore: requirements.totalCount ? Math.round((requirements.metCount / requirements.totalCount) * 100) : null,
        resumeReviewNotes: requirements.summary + (niceToHaves.missing.length ? ` Nice-to-haves missing: ${niceToHaves.missing.join('; ')}.` : ''),
        skillsFitScore: skills.score,
        skillsFitNotes: skills.summary,
        ...(eppMatch != null ? { eppValuesMatchScore: eppMatch } : {}),
        ...(companyValuesMatch != null ? { companyValuesMatchScore: companyValuesMatch } : {}),
        companyValuesNotes: eppScans.hasEpp
          ? `Company-values match ${companyValuesMatch}/100 across ${eppScans.scoredValues}/${eppScans.totalValues} values; EPP match ${eppMatch}/100 across ${eppScans.traitCount} traits.`
          : 'No EPP results on file yet.',
        screenScore: composite,
        screenRecommendation: recommendation,
        screenSummary,
        screenedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(candidates.id, input.id));

      // Apply the stage change (skip if already Hired/Rejected).
      const terminal = candidate.currentStage === 'Hired' || candidate.currentStage === 'Rejected';
      const STAGE_ORDER = STAGES as readonly string[];
      const idx = STAGE_ORDER.indexOf(candidate.currentStage);
      let movedToStage: string | null = null;

      if (!terminal && decision === 'rejected') {
        await ctx.db.update(candidates)
          .set({ currentStage: 'Rejected', rejectionReason: reason, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id, fromStage: candidate.currentStage, toStage: 'Rejected',
          changedBy: ctx.user.id, reason,
        });
        movedToStage = 'Rejected';
        await dispatchStageEmail('Rejected', candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      } else if (!terminal && decision === 'advanced' && idx >= 0 && idx <= 3) {
        const nextStage = STAGE_ORDER[idx + 1];
        await ctx.db.update(candidates)
          .set({ currentStage: nextStage as any, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id, fromStage: candidate.currentStage, toStage: nextStage as any,
          changedBy: ctx.user.id, reason: `Combined screen passed: requirements met, score ${composite}/100`,
        });
        movedToStage = nextStage;
        await dispatchStageEmail(nextStage, candidate.currentStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        }).catch(() => {});
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'run_screen', 'candidates', { candidateId: input.id, decision, composite }).catch(() => {});

      return {
        recommendation, decision, reason, movedToStage,
        composite, requirements, niceToHaves, skills,
        eppMatch, companyValuesMatch, eppScans,
        summary: screenSummary,
      };
    }),

  // Build the offer-letter input from the candidate + JD + requisition + HR inputs.
  // Deterministic letter (no AI) — editable fields in fixed places + addendum.
  // (helper below is inlined per-call)

  // Resolve the requisition (intake data) behind a candidate, for offer prefill.
  offerDefaults: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const req = jd?.reqId
        ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
        : null;

      const min = (req as any)?.salaryMin ?? null;
      const max = (req as any)?.salaryMax ?? null;
      const suggestedSalary = (min != null && max != null) ? Math.round((min + max) / 2) : (max ?? min ?? null);
      const arrangement = (req as any)?.workArrangement && (req as any).workArrangement !== 'On-site'
        ? `${(req as any).workArrangement}${(req as any)?.hybridDays ? ` (${(req as any).hybridDays} days)` : ''}`
        : null;
      const location = [(req as any)?.location, arrangement].filter(Boolean).join(' · ') || null;
      const targetStart = (req as any)?.targetStartDate
        ? new Date((req as any).targetStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

      return {
        jobTitle: jd?.jobTitle ?? null,
        department: (req as any)?.department ?? null,
        reportsTo: (req as any)?.hiringManager ?? null,
        employmentType: (req as any)?.employmentType ?? 'Full-Time',
        location,
        bandMin: min,
        bandMax: max,
        suggestedSalary,
        targetStartDate: targetStart,
        financeConfirmed: !!(req as any)?.financeConfirmed,
        variableComp: (req as any)?.variableComp ?? null,
        standardClauses: STANDARD_OFFER_CLAUSES,
        standardInternalClauses: STANDARD_INTERNAL_OFFER_CLAUSES,
      };
    }),

  // Preview the external offer letter (renders HTML; does not send or change stage).
  offerPreview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      variableComp: z.string().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const offer = await buildOfferInput(ctx.db, input);
      return { html: renderOfferLetter(offer), jobTitle: offer.jobTitle };
    }),

  // Send the external offer letter via SendGrid and move the candidate to Offered.
  sendOffer: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      variableComp: z.string().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildOfferInput(ctx.db, input);
      const { html } = await deliverOfferToCandidate(ctx.db, ctx.user.id, candidate, offer);
      return { ok: true, html };
    }),

  // ---- OFFER APPROVAL GATE ------------------------------------------------
  // The offer goes to the hiring manager for review/edit/sign-off BEFORE it
  // reaches the candidate. requestOfferApproval drops it into the manager's
  // test inbox with a tokenized review link; the manager acts via the public
  // offerApproval* procedures below.

  // Recruiter: send a drafted offer to the hiring manager for approval.
  requestOfferApproval: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      variableComp: z.string().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildOfferInput(ctx.db, input);

      const jd = candidate.jdId ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) }) : null;
      const req = jd?.reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) }) : null;
      const managerName = (req as any)?.hiringManager ?? offer.reportsTo ?? 'Hiring Manager';
      const managerEmail = process.env.HIRING_MANAGER_EMAIL ?? process.env.HR_EMAIL ?? 'hiring-manager@lightspeedsystems.com';

      const chain = await buildOfferApproverChain(ctx.db, managerName, managerEmail);
      const [row] = await ctx.db.insert(offerApprovals).values({
        candidateId: candidate.id,
        payload: offer as any,
        status: 'pending',
        kind: 'external',
        chain: chain as any,
        currentStep: 0,
        createdBy: ctx.user.id,
      }).returning();

      // Notify the first approver (the hiring manager). Each subsequent
      // approver is notified as the chain advances in offerApprovalDecide.
      await notifyOfferApprover(ctx.db, row, chain, 0, candidate, 'external');

      trackActivity(ctx.db, ctx.user.id, 'request_offer_approval', 'candidates', { candidateId: candidate.id }).catch(() => {});
      const approvalUrl = `/offer-approval/${row.id}`;
      return { ok: true, approvalId: row.id, approvalUrl, managerName, approvers: chain.length };
    }),

  // Recruiter: latest approval state for a candidate (drives the Offer section UI).
  offerApprovalStatus: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(offerApprovals)
        .where(eq(offerApprovals.candidateId, input.candidateId))
        .orderBy(desc(offerApprovals.createdAt)).limit(1);
      if (!row) return null;
      const chain = ((row as any).chain ?? []) as OfferApprovalStep[];
      const currentStep = (row as any).currentStep ?? 0;
      const approvedCount = chain.filter((cs) => cs.status === 'approved').length;
      return {
        id: row.id, status: row.status, managerName: row.managerName, managerNote: row.managerNote,
        decidedAt: row.decidedAt, sentToCandidateAt: row.sentToCandidateAt, createdAt: row.createdAt,
        totalSteps: chain.length || null,
        approvedCount,
        currentApproverName: (row.status === 'pending' && chain.length) ? (chain[currentStep]?.name ?? null) : null,
      };
    }),

  // Public (tokenized): the manager's review view.
  offerApprovalView: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(offerApprovals).where(eq(offerApprovals.id, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, row.candidateId) });
      const kind = (row as any).kind ?? 'external';
      const html = kind === 'internal'
        ? renderInternalOfferLetter(row.payload as InternalOfferLetterInput)
        : renderOfferLetter(row.payload as OfferLetterInput);
      const chain = ((row as any).chain ?? []) as OfferApprovalStep[];
      const currentStep = (row as any).currentStep ?? 0;
      return {
        status: row.status,
        kind,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : '',
        payload: row.payload,
        managerName: row.managerName,
        managerNote: row.managerNote,
        html,
        // Multi-level chain progress (empty for legacy single-gate rows).
        chain: chain.map((cs) => ({ order: cs.order, name: cs.name, status: cs.status })),
        currentStep,
        currentApproverName: chain.length ? (chain[currentStep]?.name ?? null) : null,
        stepNumber: chain.length ? currentStep + 1 : null,
        totalSteps: chain.length || null,
      };
    }),

  // Public (tokenized): save the manager's edits to the draft.
  offerApprovalSaveEdits: publicProcedure
    .input(z.object({
      token: z.string().uuid(),
      payload: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(offerApprovals).where(eq(offerApprovals.id, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This offer has already been decided.' });
      const kind = (row as any).kind ?? 'external';
      await ctx.db.update(offerApprovals).set({ payload: input.payload as any, updatedAt: new Date() }).where(eq(offerApprovals.id, input.token));
      const html = kind === 'internal'
        ? renderInternalOfferLetter(input.payload as InternalOfferLetterInput)
        : renderOfferLetter(input.payload as OfferLetterInput);
      return { ok: true, html };
    }),

  // Public (tokenized): the manager signs off (delivers to candidate) or sends back.
  offerApprovalDecide: publicProcedure
    .input(z.object({
      token: z.string().uuid(),
      action: z.enum(['approve', 'send_back']),
      managerName: z.string().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.select().from(offerApprovals).where(eq(offerApprovals.id, input.token)).limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This offer has already been decided.' });
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, row.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const kind = (row as any).kind ?? 'external';
      const payload: any = row.payload;
      const roleLabel = kind === 'internal' ? (payload?.comp?.newTitle ?? 'the role') : (payload?.jobTitle ?? 'the role');

      const chain = ((row as any).chain ?? []) as OfferApprovalStep[];
      const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();

      const deliver = async () => {
        if (kind === 'internal') await deliverInternalOfferToCandidate(ctx.db, row.createdBy ?? null, candidate, payload as InternalOfferLetterInput);
        else await deliverOfferToCandidate(ctx.db, row.createdBy ?? null, candidate, payload as OfferLetterInput);
      };
      const notifySentBack = async () => {
        try {
          await ctx.db.insert(inboundEmails).values({
            fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
            fromName: input.managerName ? `${input.managerName} (approver)` : 'Offer approver',
            toEmail: process.env.HR_EMAIL ?? process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
            subject: `Offer sent back: ${candidateName} — ${roleLabel}`,
            body: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">`
              + `<p>The draft offer for <strong>${escHtml(candidateName)}</strong> was sent back${input.managerName ? ` by ${escHtml(input.managerName)}` : ''} and was <strong>not</strong> sent to the candidate.</p>`
              + `<p><strong>Reason:</strong> ${escHtml(input.note ?? '(none given)')}</p></div>`,
            replyTag: 'offer_approval',
            source: 'simulated',
            raw: { kind: 'offer_sent_back', approvalId: row.id, candidateId: candidate.id },
          });
        } catch (err) { console.error('[offer-approval] send-back inbox failed:', err); }
      };

      // ---- Legacy single-manager gate (rows created before migration 0050) ----
      if (chain.length === 0) {
        if (input.action === 'approve') {
          await deliver();
          await ctx.db.update(offerApprovals)
            .set({ status: 'approved', managerName: input.managerName ?? null, managerNote: input.note ?? null, decidedAt: new Date(), sentToCandidateAt: new Date(), updatedAt: new Date() })
            .where(eq(offerApprovals.id, row.id));
          return { ok: true, status: 'approved' as const };
        }
        await ctx.db.update(offerApprovals)
          .set({ status: 'sent_back', managerName: input.managerName ?? null, managerNote: input.note ?? null, decidedAt: new Date(), updatedAt: new Date() })
          .where(eq(offerApprovals.id, row.id));
        await notifySentBack();
        return { ok: true, status: 'sent_back' as const };
      }

      // ---- Multi-level approval chain ----
      const i = (row as any).currentStep ?? 0;
      if (i < 0 || i >= chain.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This offer has already been fully decided.' });
      }
      const nowIso = new Date().toISOString();

      if (input.action === 'approve') {
        chain[i] = { ...chain[i], status: 'approved', actedName: input.managerName ?? null, note: input.note ?? null, decidedAt: nowIso };
        const isFinal = i >= chain.length - 1;
        if (isFinal) {
          // Final approver: deliver the letter to the candidate and close out.
          await deliver();
          await ctx.db.update(offerApprovals)
            .set({ chain: chain as any, status: 'approved', managerName: input.managerName ?? chain[i].name, managerNote: input.note ?? null, decidedAt: new Date(), sentToCandidateAt: new Date(), updatedAt: new Date() })
            .where(eq(offerApprovals.id, row.id));
          return { ok: true, status: 'approved' as const };
        }
        // Advance to the next approver and notify them; nothing goes to the candidate yet.
        const next = i + 1;
        await ctx.db.update(offerApprovals)
          .set({ chain: chain as any, currentStep: next, updatedAt: new Date() })
          .where(eq(offerApprovals.id, row.id));
        await notifyOfferApprover(ctx.db, { id: row.id, payload }, chain, next, candidate, kind);
        return { ok: true, status: 'advanced' as const, nextApproverName: chain[next].name, stepNumber: next + 1, totalSteps: chain.length };
      }

      // send_back at any step halts the chain and returns it to the recruiter.
      chain[i] = { ...chain[i], status: 'sent_back', actedName: input.managerName ?? null, note: input.note ?? null, decidedAt: nowIso };
      await ctx.db.update(offerApprovals)
        .set({ chain: chain as any, status: 'sent_back', managerName: input.managerName ?? null, managerNote: input.note ?? null, decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(offerApprovals.id, row.id));
      await notifySentBack();
      return { ok: true, status: 'sent_back' as const };
    }),

  // Send the offer letter for e-signature via Adobe Sign. Adobe Sign emails the
  // candidate the signable document (not SendGrid). Stub-safe: with no Adobe Sign
  // credentials it returns { configured:false } and changes nothing.
  sendOfferViaAdobeSign: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      baseSalary: z.number().int().optional(),
      variableComp: z.string().optional(),
      startDate: z.string().optional(),
      reportsTo: z.string().optional(),
      department: z.string().optional(),
      employmentType: z.string().optional(),
      location: z.string().optional(),
      jobTitle: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildOfferInput(ctx.db, input);
      const letterHtml = renderOfferLetter(offer);

      const result = await createOfferAgreement({
        candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(),
        candidateEmail: candidate.email,
        jobTitle: offer.jobTitle,
        letterHtml,
      });

      if (!result.configured) {
        return { configured: false as const, message: 'Adobe Sign is not connected yet — add ADOBE_SIGN_BASE_URL and ADOBE_SIGN_ACCESS_TOKEN (Railway) to enable sending.' };
      }
      if (result.error) {
        return { configured: true as const, error: result.error };
      }

      // Advance to Offered + record for visibility.
      if (candidate.currentStage !== 'Offered' && candidate.currentStage !== 'Hired' && candidate.currentStage !== 'Rejected') {
        await ctx.db.update(candidates).set({ currentStage: 'Offered', updatedAt: new Date() }).where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id, fromStage: candidate.currentStage, toStage: 'Offered',
          changedBy: ctx.user.id, reason: `Offer sent for e-signature via Adobe Sign (agreement ${result.agreementId})`,
        });
      }
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Adobe Sign (offer)', toEmail: candidate.email,
          subject: `Offer sent via Adobe Sign — ${offer.jobTitle}`,
          body: `Adobe Sign agreement ${result.agreementId} (status: ${result.status}) sent to ${candidate.email} for signature.`,
          replyTag: 'adobe_sign_offer', source: 'simulated', raw: { kind: 'adobe_sign_offer', agreementId: result.agreementId, candidateId: input.id },
        });
      } catch (err) { console.error('[adobesign] inbox record failed:', err); }

      trackActivity(ctx.db, ctx.user.id, 'send_offer_adobesign', 'candidates', { candidateId: input.id, agreementId: result.agreementId }).catch(() => {});
      return { configured: true as const, agreementId: result.agreementId, status: result.status };
    }),

  // AI-DRAFT a transition plan for the internal-move offer addendum. The offer
  // letter template stays deterministic — this only drafts the addendum body,
  // which HR then edits. Falls back to a placeholder with no ANTHROPIC_API_KEY.
  draftTransitionPlan: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      effectiveDate: z.string().optional(),
      newTitle: z.string().optional(),
      newManager: z.string().optional(),
      newDepartment: z.string().optional(),
      currentTitle: z.string().optional(),
      currentManager: z.string().optional(),
      currentDepartment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const offer = await buildInternalOfferInput(ctx.db, input);
      const c = offer.comp;
      const result = await draftTransitionPlan({
        firstName: offer.firstName,
        lastName: offer.lastName,
        currentTitle: c.currentTitle,
        currentDepartment: c.currentDepartment,
        currentManager: c.currentManager,
        newTitle: c.newTitle,
        newDepartment: c.newDepartment,
        newManager: c.newManager,
        effectiveDate: offer.effectiveDate,
      });
      return result;
    }),

  // ── INTERNAL-MOVE OFFER (before/now comparison + transition addendum) ──
  // Preview the internal-move offer letter (renders HTML; no send, no stage change).
  // Recruiter: send a drafted INTERNAL-move offer to the hiring manager for approval.
  requestInternalOfferApproval: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      effectiveDate: z.string().optional(),
      newTitle: z.string().optional(),
      newBaseSalary: z.number().int().optional(),
      newBonus: z.string().optional(),
      newManager: z.string().optional(),
      newDepartment: z.string().optional(),
      newStipends: z.string().optional(),
      currentTitle: z.string().optional(),
      currentBaseSalary: z.number().int().optional(),
      currentBonus: z.string().optional(),
      currentManager: z.string().optional(),
      currentDepartment: z.string().optional(),
      currentStipends: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildInternalOfferInput(ctx.db, input);

      const managerName = offer.comp.newManager ?? 'Hiring Manager';
      const managerEmail = process.env.HIRING_MANAGER_EMAIL ?? process.env.HR_EMAIL ?? 'hiring-manager@lightspeedsystems.com';

      const chain = await buildOfferApproverChain(ctx.db, managerName, managerEmail);
      const [row] = await ctx.db.insert(offerApprovals).values({
        candidateId: candidate.id,
        payload: offer as any,
        status: 'pending',
        kind: 'internal',
        chain: chain as any,
        currentStep: 0,
        createdBy: ctx.user.id,
      }).returning();

      await notifyOfferApprover(ctx.db, row, chain, 0, candidate, 'internal');

      trackActivity(ctx.db, ctx.user.id, 'request_internal_offer_approval', 'candidates', { candidateId: candidate.id }).catch(() => {});
      const approvalUrl = `/offer-approval/${row.id}`;
      return { ok: true, approvalId: row.id, approvalUrl, managerName, approvers: chain.length };
    }),

  internalOfferPreview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      effectiveDate: z.string().optional(),
      newTitle: z.string().optional(),
      newBaseSalary: z.number().int().optional(),
      newBonus: z.string().optional(),
      newManager: z.string().optional(),
      newDepartment: z.string().optional(),
      newStipends: z.string().optional(),
      currentTitle: z.string().optional(),
      currentBaseSalary: z.number().int().optional(),
      currentBonus: z.string().optional(),
      currentManager: z.string().optional(),
      currentDepartment: z.string().optional(),
      currentStipends: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const offer = await buildInternalOfferInput(ctx.db, input);
      return { html: renderInternalOfferLetter(offer), newTitle: offer.comp.newTitle };
    }),

  // Send the internal-move offer letter via SendGrid + inbox copy, and move to Offered.
  sendInternalOffer: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      effectiveDate: z.string().optional(),
      newTitle: z.string().optional(),
      newBaseSalary: z.number().int().optional(),
      newBonus: z.string().optional(),
      newManager: z.string().optional(),
      newDepartment: z.string().optional(),
      newStipends: z.string().optional(),
      currentTitle: z.string().optional(),
      currentBaseSalary: z.number().int().optional(),
      currentBonus: z.string().optional(),
      currentManager: z.string().optional(),
      currentDepartment: z.string().optional(),
      currentStipends: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildInternalOfferInput(ctx.db, input);
      const { html } = await deliverInternalOfferToCandidate(ctx.db, ctx.user.id, candidate, offer);
      return { ok: true, html };
    }),

  // Send the internal-move offer for e-signature via Adobe Sign. Same env-gated
  // Adobe Sign service as the external letter (stub-safe with no credentials) —
  // just renders the internal before/now letter instead.
  sendInternalOfferViaAdobeSign: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      effectiveDate: z.string().optional(),
      newTitle: z.string().optional(),
      newBaseSalary: z.number().int().optional(),
      newBonus: z.string().optional(),
      newManager: z.string().optional(),
      newDepartment: z.string().optional(),
      newStipends: z.string().optional(),
      currentTitle: z.string().optional(),
      currentBaseSalary: z.number().int().optional(),
      currentBonus: z.string().optional(),
      currentManager: z.string().optional(),
      currentDepartment: z.string().optional(),
      currentStipends: z.string().optional(),
      legalClauses: z.array(z.string()).optional(),
      addendum: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const offer = await buildInternalOfferInput(ctx.db, input);
      const newTitle = offer.comp.newTitle;
      const letterHtml = renderInternalOfferLetter(offer);

      const result = await createOfferAgreement({
        candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(),
        candidateEmail: candidate.email,
        jobTitle: newTitle,
        letterHtml,
      });

      if (!result.configured) {
        return { configured: false as const, message: 'Adobe Sign is not connected yet — add ADOBE_SIGN_BASE_URL and ADOBE_SIGN_ACCESS_TOKEN (Railway) to enable sending.' };
      }
      if (result.error) {
        return { configured: true as const, error: result.error };
      }

      if (candidate.currentStage !== 'Offered' && candidate.currentStage !== 'Hired' && candidate.currentStage !== 'Rejected') {
        await ctx.db.update(candidates).set({ currentStage: 'Offered', updatedAt: new Date() }).where(eq(candidates.id, input.id));
        await ctx.db.insert(candidateStageHistory).values({
          candidateId: input.id, fromStage: candidate.currentStage, toStage: 'Offered',
          changedBy: ctx.user.id, reason: `Internal offer sent for e-signature via Adobe Sign (agreement ${result.agreementId})`,
        });
      }
      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Adobe Sign (internal offer)', toEmail: candidate.email,
          subject: `Internal offer sent via Adobe Sign — ${newTitle}`,
          body: `Adobe Sign agreement ${result.agreementId} (status: ${result.status}) sent to ${candidate.email} for signature.`,
          replyTag: 'adobe_sign_internal_offer', source: 'simulated', raw: { kind: 'adobe_sign_internal_offer', agreementId: result.agreementId, candidateId: input.id },
        });
      } catch (err) { console.error('[adobesign-internal] inbox record failed:', err); }

      trackActivity(ctx.db, ctx.user.id, 'send_internal_offer_adobesign', 'candidates', { candidateId: input.id, agreementId: result.agreementId }).catch(() => {});
      return { configured: true as const, agreementId: result.agreementId, status: result.status };
    }),

  // Notify an internal candidate's leadership chain (manual list for now;
  // auto org-chart via HRIS later). SendGrid + test-inbox copy, like the rest.
  notifyLeadership: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      const emails = ((candidate as any).leadershipAwareness ?? '')
        .split(/[,;\n]/).map((e: string) => e.trim()).filter((e: string) => e.includes('@'));
      if (emails.length === 0) return { sent: 0, reason: 'No leadership emails on file' };

      const jobTitle = await getJobTitle(ctx.db, candidate.jdId);
      const subject = `Internal applicant: ${candidate.firstName} ${candidate.lastName}${jobTitle ? ` \u2014 ${jobTitle}` : ''}`;
      const body = `${candidate.firstName} ${candidate.lastName}${(candidate as any).internalEmployee ? ` (${(candidate as any).internalEmployee})` : ''} has applied internally for ${jobTitle ?? 'an open role'}. You are on their leadership awareness list so nobody is caught off guard. No action is required unless you have concerns about timing or transition.`;

      let sent = 0;
      for (const to of emails) {
        await sendEmail({ to, subject, html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;">${body}</div>`, templateId: 'internal_awareness' }).catch(() => {});
        try {
          await ctx.db.insert(inboundEmails).values({
            fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
            fromName: 'Lightspeed Hiring',
            toEmail: to, subject, body, replyTag: 'internal_awareness', source: 'simulated',
            raw: { kind: 'internal_awareness', candidateId: input.id },
          });
        } catch (err) { console.error('[internal] inbox record failed:', err); }
        sent++;
      }
      trackActivity(ctx.db, ctx.user.id, 'notify_leadership', 'candidates', { candidateId: input.id, sent }).catch(() => {});
      return { sent };
    }),

  // Notify a single internal candidate's manager (backfill for candidates whose
  // manager wasn't captured at express-interest). Emails the manager, records the
  // awareness, and flips managerAware = true. Internal candidates only.
  notifyManager: protectedProcedure
    .input(z.object({ id: z.string().uuid(), managerEmail: z.string().email().max(300) }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!(candidate as any).isInternal) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not an internal candidate.' });
      }
      const jobTitle = await getJobTitle(ctx.db, candidate.jdId);
      const applicantName = `${candidate.firstName} ${candidate.lastName}`;

      await emailInternalInterestAlert(input.managerEmail, {
        applicantName,
        currentRole: (candidate as any).internalEmployee ?? null,
        jobTitle: jobTitle ?? 'an open role',
        forManager: true,
      }).catch((err) => console.error('[notifyManager] email failed:', err));

      // Merge the manager into the awareness list + mark manager aware.
      const existing = (((candidate as any).leadershipAwareness ?? '') as string)
        .split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'));
      const merged = Array.from(new Set([...existing, input.managerEmail]));
      await ctx.db.update(candidates).set({
        managerAware: true,
        leadershipAwareness: merged.join(', '),
        updatedAt: new Date(),
      } as any).where(eq(candidates.id, input.id));

      try {
        await ctx.db.insert(inboundEmails).values({
          fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
          fromName: 'Lightspeed Hiring',
          toEmail: input.managerEmail,
          subject: `Internal interest alert \u2014 ${applicantName}${jobTitle ? ` \u2014 ${jobTitle}` : ''}`,
          body: `${applicantName}${(candidate as any).internalEmployee ? ` (currently ${(candidate as any).internalEmployee})` : ''} has expressed interest in ${jobTitle ?? 'an open role'}. As their manager you're being looped in so nothing catches you off guard.`,
          replyTag: 'internal_interest_alert', source: 'simulated',
          raw: { kind: 'internal_manager_alert', candidateId: input.id },
        } as any);
      } catch (err) { console.error('[notifyManager] inbox record failed:', err); }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'notify_manager', 'candidates', { candidateId: input.id }).catch(() => {});
      return { ok: true };
    }),

  // Store AI-generated interview questions
  setInterviewQuestions: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      questions: z.array(z.object({
        category: z.string(),
        question: z.string(),
        rationale: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({ interviewQuestions: input.questions, updatedAt: new Date() })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),

  // Process a finished interview: transcript -> AI feedback (candidate,
  // hiring-manager, interviewer coaching) -> store -> email HR + interviewer.
  // Pass a transcript to use it; omit it to reuse a stored transcript, or —
  // when Zoom isn't connected — auto-generate a realistic sample transcript
  // so the whole flow works end-to-end.
  processInterview: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      transcript: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const result = await processInterviewFeedback({
        candidateId: input.id,
        transcript: input.transcript ?? null,
        changedBy: ctx.user.id,
        sendEmails: true,
      });

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      trackActivity(ctx.db, ctx.user.id, 'process_interview', 'candidates', {
        candidateId: input.id, transcriptSource: result.transcriptSource,
      }).catch(() => {});

      return {
        interviewScore: result.feedback.interviewScore,
        feedbackHr: result.feedback.feedbackHr,
        feedbackCandidate: result.feedback.feedbackCandidate,
        feedbackInterviewer: result.feedback.feedbackInterviewer,
        transcript: result.transcript,
        transcriptSource: result.transcriptSource,
        emailedInterviewer: result.emailedInterviewer,
      };
    }),

  // Send CCAT + EPP assessment invitation via Criteria Corp
  sendAssessment: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      if (candidate.criteriaCorpId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assessment already sent — use refreshScores to pull latest results',
        });
      }

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      const result = await sendAssessment({
        candidateId: candidate.id,
        firstName:   candidate.firstName,
        lastName:    candidate.lastName,
        email:       candidate.email,
        jobTitle:    jd?.jobTitle ?? 'Unknown',
      });

      // Store the Criteria Corp applicant ID + mark assessment as sent
      await ctx.db.update(candidates)
        .set({
          criteriaCorpId:  result.criteriaApplicantId,
          assessmentSentAt: new Date(),
          updatedAt:        new Date(),
        })
        .where(eq(candidates.id, input.id));

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { ...result, candidateId: input.id };
    }),

  // Pull latest CCAT + EPP scores from Criteria Corp
  refreshScores: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!candidate.criteriaCorpId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No assessment sent yet — send assessment first',
        });
      }

      const scores = await getScores(candidate.criteriaCorpId);

      // Only update if assessment is actually completed
      if (scores.status !== 'completed') {
        return { status: scores.status, message: 'Assessment not yet completed', scores: null };
      }

      await ctx.db.update(candidates)
        .set({
          ccatScore:             scores.ccatScore ?? undefined,
          eppProfile:            scores.eppProfile ?? undefined,
          assessmentCompletedAt: scores.assessmentCompletedAt ? new Date(scores.assessmentCompletedAt) : undefined,
          updatedAt:             new Date(),
        })
        .where(eq(candidates.id, input.id));

      // Ingest the 12-trait EPP into candidate_epp_scores (the store the whole app
      // reads), then compute + persist both EPP-derived scores from the real data.
      if (scores.eppProfile) {
        const scans = await ingestEppResults(ctx.db, input.id, scores.eppProfile as Record<string, number>);
        await ctx.db.update(candidates)
          .set({
            ...(scans.eppMatch != null ? { eppValuesMatchScore: scans.eppMatch } : {}),
            ...(scans.companyValuesMatch != null ? { companyValuesMatchScore: scans.companyValuesMatch } : {}),
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, input.id));
      }

      // Automatic pass/fail decision on the CCAT score (SendGrid emails inside)
      await applyAssessmentDecision(ctx.db, input.id);

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { status: 'completed', scores };
    }),

  // Run EPP vs. values analysis for a candidate
  analyzeEpp: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.id) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      // Screen from the candidate's real 12-trait EPP results (candidate_epp_scores).
      const scans = await computeEppScans(ctx.db, input.id);
      if (!scans.hasEpp) {
        return { skipped: true, reason: 'No EPP results on file — run after Criteria Corp EPP results are received (Refresh scores).' };
      }

      // Persist both EPP-derived scores.
      await ctx.db.update(candidates).set({
        ...(scans.eppMatch != null ? { eppValuesMatchScore: scans.eppMatch } : {}),
        ...(scans.companyValuesMatch != null ? { companyValuesMatchScore: scans.companyValuesMatch } : {}),
        updatedAt: new Date(),
      }).where(eq(candidates.id, input.id));

      // Company-values match gates the Work Sample -> Values Review advance.
      const THRESHOLD = 70;
      let stageAction: string | null = null;
      if (candidate.currentStage === 'Work Sample' && scans.companyValuesMatch != null) {
        if (scans.companyValuesMatch >= THRESHOLD) {
          await ctx.db.update(candidates)
            .set({ currentStage: 'Values Review', updatedAt: new Date() })
            .where(eq(candidates.id, input.id));
          await ctx.db.insert(candidateStageHistory).values({
            candidateId: input.id, fromStage: 'Work Sample', toStage: 'Values Review',
            changedBy: ctx.user.id,
            reason: `Company-values match ${scans.companyValuesMatch} met threshold of ${THRESHOLD}`,
          });
          stageAction = 'advanced_to_values_review';
        } else {
          stageAction = 'held_at_work_sample';
        }
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { scans, threshold: THRESHOLD, stageAction };
    }),

  // Process interview transcript through AI and store feedback
  processInterviewFeedback: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      transcript: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND' });

      const jd = candidate.jdId
        ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;

      // Store transcript if provided
      if (input.transcript) {
        await ctx.db.update(candidates)
          .set({ interviewTranscript: input.transcript, updatedAt: new Date() })
          .where(eq(candidates.id, input.id));
      }

      const transcript = input.transcript ?? candidate.interviewTranscript ?? undefined;

      // Run AI feedback analysis
      const feedback = await analyzeInterviewTranscript({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: jd?.jobTitle ?? undefined,
        transcript,
        interviewQuestions: candidate.interviewQuestions as any ?? null,
        ccatScore: candidate.ccatScore,
        eppValuesMatchScore: candidate.eppValuesMatchScore,
        workSampleScore: candidate.workSampleScore,
        resumeReviewScore: candidate.resumeReviewScore,
      });

      // Store results
      await ctx.db.update(candidates)
        .set({
          interviewFeedbackHr: feedback.feedbackHr,
          interviewFeedbackCandidate: feedback.feedbackCandidate,
          interviewScore: feedback.interviewScore,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, input.id));

      // HR feedback email
      const hrSubject = `Interview debrief: ${candidate.firstName} ${candidate.lastName} — ${jd?.jobTitle ?? 'candidate'}`;
      await sendEmail({
        to: process.env.HR_EMAIL ?? 'jade.friedman@lsscorp.net',
        subject: hrSubject,
        templateId: 'interview_feedback_hr',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
            <h2>Interview Feedback — ${candidate.firstName} ${candidate.lastName}</h2>
            <p><strong>Role:</strong> ${jd?.jobTitle ?? 'Unknown'} &nbsp;|&nbsp; <strong>Score:</strong> ${feedback.interviewScore}/100</p>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0;"/>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;">${feedback.feedbackHr}</pre>
          </div>
        `,
      });

      // Candidate feedback email (if in Interviewed stage)
      if (candidate.currentStage === 'Interviewed') {
        const candSubject = `Your interview feedback — ${jd?.jobTitle ?? 'Lightspeed Systems'}`;
        await sendEmail({
          to: candidate.email,
          subject: candSubject,
          templateId: 'interview_feedback_candidate',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
              <h2>Interview feedback</h2>
              <p>Hi ${candidate.firstName},</p>
              <p>Thank you for interviewing for <strong>${jd?.jobTitle ?? 'the position'}</strong>. Here's a summary of your interview feedback:</p>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:14px;line-height:1.6;">
                ${feedback.feedbackCandidate}
              </div>
              <p style="margin-top:20px;">We'll be in touch with next steps shortly.</p>
              <p>Best,<br/>Lightspeed Systems Recruiting</p>
            </div>
          `,
        });
      }

      await auditChange(ctx.db, ctx.user.id, input.id, 'candidates', 'update');
      return { feedback, candidateId: input.id };
    }),

  // Store Zoom transcript + AI feedback after interview
  setInterviewFeedback: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      transcript: z.string().optional(),
      feedbackHr: z.string(),
      feedbackCandidate: z.string(),
      interviewScore: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.db.update(candidates)
        .set({
          interviewTranscript: input.transcript,
          interviewFeedbackHr: input.feedbackHr,
          interviewFeedbackCandidate: input.feedbackCandidate,
          interviewScore: input.interviewScore,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, input.id))
        .returning();
      return candidate;
    }),

  // Internal candidates currently in the pipeline (not rejected/hired), with role + department.
  internalPipeline: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.query.candidates.findMany({ where: eq(candidates.isInternal, true) });
      const active = rows.filter((c: any) => c.currentStage !== 'Rejected' && c.currentStage !== 'Hired');
      const out: any[] = [];
      for (const c of active) {
        const jd = c.jdId ? await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, c.jdId) }) : null;
        const req = (jd as any)?.reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, (jd as any).reqId) }) : null;
        out.push({
          id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email,
          stage: c.currentStage, jobTitle: jd?.jobTitle ?? null, department: (req as any)?.department ?? null,
          managerAware: !!(c as any).managerAware,
          leadershipListed: !!(((c as any).leadershipAwareness ?? '') as string).trim(),
          internalEmployee: (c as any).internalEmployee ?? null,
        });
      }
      return out;
    }),

  // Leadership notification recipients — auto-emailed on each internal express-interest.
  getReportConfig: protectedProcedure
    .query(async ({ ctx }) => getInternalReportConfig(ctx.db)),

  setReportConfig: protectedProcedure
    .input(z.object({ recipients: z.array(z.string().email()), enabled: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      await setInternalReportConfig(ctx.db, { recipients: input.recipients, enabled: input.enabled ?? true }, ctx.user.id);
      return { ok: true };
    }),
});
