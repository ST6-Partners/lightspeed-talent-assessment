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
import { assessmentTasks } from '../db/schema/assessmentTasks.js';
import { departments } from '../db/schema/departments.js';
import { generateRoleJD, generateStandardQuestions, standardQuestionSet, generateWorkSampleTask } from '../services/ai.js';
import { approverEmail, buildApprovalRequestEmail, sendApprovalRequest, buildKickoffEmail, HIRING_TEAM_INBOX, sendEmail } from '../services/email.js';
import { emailApprovalRejected, emailApprovalSentBack } from '../services/email.js';
import { users } from '../db/schema/core.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';
import { announceRoleInternally } from '../services/internalAnnounce.js';

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
  if (req.mustHaves) rows.push({ label: 'Must-haves', value: String(req.mustHaves) });
  if (req.knownConstraints) rows.push({ label: 'Known constraints', value: String(req.knownConstraints) });
  return rows;
}

// Notify the intake submitter (+ test inbox) that their intake was rejected.
async function notifyIntakeRejected(db: DrizzleClient, reqId: string, roleLabel: string, note: string): Promise<void> {
  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, reqId) });
  if (!req) return;
  let submitterEmail: string | null = null;
  if ((req as any).createdBy) {
    const u = await db.query.users.findFirst({ where: eq(users.id, (req as any).createdBy) });
    submitterEmail = u?.email ?? null;
  }
  const to = submitterEmail || approverEmail('hr');
  const roleTitle = `${req.department}${(req as any).jobTitle ? ' · ' + (req as any).jobTitle : ''}`;
  try {
    await emailApprovalRejected(to, { roleLabel, department: req.department, hiringManager: req.hiringManager, note });
  } catch (err) { console.error('[intake] rejected-notify send failed:', err); }
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
      toEmail: to, subject: `Intake rejected (${roleLabel}): ${roleTitle}`,
      body: `The intake for ${roleTitle} was rejected at the ${roleLabel} step. Reason: ${note}`,
      replyTag: 'intake_rejected', source: 'simulated', raw: { kind: 'intake_rejected', reqId },
    });
  } catch (err) { console.error('[intake] rejected-notify inbox record failed:', err); }
}

// Notify the submitter (+ test inbox) that their intake was SENT BACK FOR EDITS
// (changes requested), which is distinct from a rejection, so the email reads
// clearly and nobody deletes it thinking the role was killed.
async function notifyIntakeSentBack(db: DrizzleClient, reqId: string, roleLabel: string, note: string): Promise<void> {
  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, reqId) });
  if (!req) return;
  let submitterEmail: string | null = null;
  if ((req as any).createdBy) {
    const u = await db.query.users.findFirst({ where: eq(users.id, (req as any).createdBy) });
    submitterEmail = u?.email ?? null;
  }
  const to = submitterEmail || approverEmail('hr');
  const roleTitle = `${req.department}${(req as any).jobTitle ? ' - ' + (req as any).jobTitle : ''}`;
  const editUrl = `${appBaseUrl()}/intake-edit/${reqId}`;
  try {
    await emailApprovalSentBack(to, { roleLabel, department: req.department, hiringManager: req.hiringManager, note, editUrl });
  } catch (err) { console.error('[intake] sent-back-notify send failed:', err); }
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
      toEmail: to, subject: `Intake sent back for edits (${roleLabel}): ${roleTitle}`,
      body: `The intake for ${roleTitle} was sent back for edits at the ${roleLabel} step. This is not a rejection - please update the intake and re-submit it. What to change: ${note}  Open, review & edit: ${editUrl}`,
      replyTag: 'intake_sent_back', source: 'simulated', raw: { kind: 'intake_sent_back', reqId, editUrl, approvalUrl: editUrl },
    });
  } catch (err) { console.error('[intake] sent-back-notify inbox record failed:', err); }
}

// Email + test-inbox record for ONE approver (their step's tokenized review link).
async function notifyApprover(db: DrizzleClient, req: any, approval: { id: string; approverRole: string }): Promise<string | null> {
  const to = approverEmail(approval.approverRole);
  const roleLabel = approval.approverRole;
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
  const commonArgs = {
    department: req.department, hiringManager: req.hiringManager,
    summaryRows: intakeSummaryRows(req), team, awareness, rounds,
    jdTitle: extras?.jdTitle, questions: extras?.questions, externalPostDate: extras?.externalPostDate,
  };
  // Interviewers get an availability link; everyone else (non-interviewing team + the awareness list) does not.
  const withLink = buildKickoffEmail({ ...commonArgs, schedulingUrl: `${appBaseUrl()}/hiring/interviews` });
  const base = buildKickoffEmail(commonArgs);
  const subject = base.subject;
  // Who actually interviews: per-round interviewers + team members assigned to a round.
  const interviewerRefs = new Set(
    [
      ...rounds.map((r: any) => r.interviewer),
      ...team.filter((t: any) => t.roundRef || /interview/i.test(t.roleInProcess ?? '')).map((t: any) => t.personRef),
    ].filter((x: any): x is string => typeof x === 'string' && /.+@.+\..+/.test(x)),
  );
  // Record one copy (interviewer version, so the availability link is verifiable) into the team inbox.
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: HIRING_TEAM_INBOX, subject, body: withLink.text, replyTag: 'kickoff', source: 'simulated',
      raw: { kind: 'kickoff', reqId: req.id },
    });
  } catch (err) { console.error('[intake] kickoff inbox record failed:', err); }
  // Real send: interviewers get the availability CTA, everyone else gets the base kickoff.
  const emailLike = [...team.map((t: any) => t.personRef), ...awareness.map((a: any) => a.personRef)]
    .filter((x: string) => /.+@.+\..+/.test(x));
  for (const to of Array.from(new Set(emailLike))) {
    const body = interviewerRefs.has(to) ? withLink : base;
    try { await sendEmail({ to, subject, html: body.html, templateId: 'intake_kickoff' }); } catch (err) { console.error('[intake] kickoff send failed:', err); }
  }
}

// Email + test-inbox record: tell the hiring manager a NEW JD is waiting for their
// review in the JD tab (fires for every different-JD / new-headcount approval).
async function notifyJdReview(db: DrizzleClient, req: any, jdTitle: string | undefined, jdId: string): Promise<void> {
  const to = approverEmail('hiring manager');
  const reviewUrl = `${appBaseUrl()}/jd-review/${jdId}`;
  const role = `${req.department}${jdTitle ? ' \u00b7 ' + jdTitle : ''}`;
  const subject = `New JD to review & sign off: ${role}`;
  const body = `A new job description for ${role} was generated from the approved intake and is waiting for your review. Open the Talent Assessment app \u2192 Job Descriptions, review the details, and approve it to clear the "NEW JD for review" flag. The role is NOT opened and no hiring kickoff is sent until you approve. Review & sign off: ${reviewUrl}`;
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
      toEmail: to, subject, body, replyTag: 'jd_review', source: 'simulated',
      raw: { kind: 'jd_review', reqId: req.id, jdId, reviewUrl, approvalUrl: reviewUrl },
    });
  } catch (err) { console.error('[intake] jd-review inbox record failed:', err); }
  const html = `<p>A new job description for <strong>${role}</strong> needs your review. <strong>The role is not opened and no hiring kickoff is sent until you approve.</strong></p><p><a href="${reviewUrl}" style="display:inline-block;padding:10px 18px;background:#15803d;color:#fff;border-radius:7px;text-decoration:none;font-weight:600;">Review &amp; sign off</a></p><p style="font-size:12px;color:#888;">Or paste this link: ${reviewUrl}</p>`;
  try { await sendEmail({ to, subject, html, templateId: 'jd_review' }); } catch (err) { console.error('[intake] jd-review send failed:', err); }
}

// Shared: open the role (status -> Open) and send the hiring kickoff. Fires
// immediately for backfill (same JD); for new-JD reasons it fires only after the
// hiring manager signs off on the JD.
async function openRoleAndSendKickoff(db: DrizzleClient, req: any, jdTitle?: string, jdId?: string): Promise<void> {
  const qRow = (await db.select().from(interviewQuestions)
    .where(eq(interviewQuestions.reqId, req.id))
    .orderBy(desc(interviewQuestions.createdAt)).limit(1))[0];
  const questions = ((qRow?.questions as any[]) ?? []);
  const externalPostDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    await db.update(jobRequisitions).set({ status: 'Open', postedAt: new Date(), updatedAt: new Date() }).where(eq(jobRequisitions.id, req.id));
  } catch (err) { console.error('[intake] posting (status Open) failed:', err); }
  // Auto-announce the role to all employees on open, exactly once (replaces the manual megaphone).
  // Prefer the JD passed by the caller (handles backfill, where the role opens against an
  // existing base JD whose reqId points at the ORIGINAL req, not this one); fall back to a
  // reqId lookup for JDs created for this req (new headcount / replacement).
  try {
    const freshReq: any = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, req.id) });
    if (freshReq && !freshReq.internalAnnouncedAt) {
      let jdRow: any = jdId ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) }) : null;
      if (!jdRow) jdRow = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.reqId, req.id) });
      if (jdRow) {
        await announceRoleInternally(db, { id: jdRow.id, jobTitle: jdRow.jobTitle }, (req as any).department ?? '');
        await db.update(jobRequisitions).set({ internalAnnouncedAt: new Date(), updatedAt: new Date() }).where(eq(jobRequisitions.id, req.id));
      }
    }
  } catch (err) { console.error('[intake] auto internal-announce failed:', err); }
  await sendKickoff(db, req, { jdTitle, questions, externalPostDate });
}

// Clear the "NEW JD for review" flag and, if the role was waiting on this JD, open
// the role + send the kickoff. Shared by the tokenized email link and the in-app
// button. Idempotent: a JD that is not pending review is left as-is (no duplicate
// kickoff); the kickoff only fires while the requisition is still 'Approved'.
export async function approveJdAndOpenRole(db: DrizzleClient, jdId: string): Promise<any | null> {
  const jd = (await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, jdId)))[0] ?? null;
  if (!jd) return null;
  if (!(jd as any).pendingReview) return jd;
  const [updated] = await db.update(jobDescriptions)
    .set({ pendingReview: false, status: 'Published', publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobDescriptions.id, jdId)).returning();
  const req = jd.reqId ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) }) : null;
  if (req && req.status === 'Approved') {
    await openRoleAndSendKickoff(db, req, jd.jobTitle, jd.id);
  }
  return updated;
}

// On final approval, the intake "reason" drives what happens to the JD:
//   - backfill                    -> reuse the existing JD as-is; NO new JD row is
//                                    created (it already lives in the JD tab).
//   - replacement_diff /          -> author a NEW JD from the old JD + the "how it
//     termination_diff               should differ" note; flag pending_review; email HM.
//   - new_headcount               -> author a NEW JD from the free-text description
//                                    alone; flag pending_review; email HM.
// The JD is generated at creation time so the hiring manager reviews real content.
// AI materials are net-new and role-specific, not a summary of the old JD.
async function runKickoffAndPosting(db: DrizzleClient, req: any): Promise<void> {
  let jdTitle: string | undefined;
  let questions: Array<{ category?: string; question: string }> = [];

  const reason = (req.reasonType ?? '').trim();
  const baseJd = req.baseJdId
    ? (await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, req.baseJdId)))[0] ?? null
    : null;
  const changeNote = (req.roleChangeNote ?? '').trim();

  if (reason === 'backfill') {
    // Same JD: reuse the existing one; do NOT create a duplicate JD row. The role
    // opens against the JD already in the JD tab. Copy its question set to this req.
    jdTitle = baseJd?.jobTitle;
    try {
      const prevQ = baseJd
        ? (await db.select().from(interviewQuestions)
            .where(eq(interviewQuestions.reqId, baseJd.reqId))
            .orderBy(desc(interviewQuestions.createdAt)).limit(1))[0]
        : undefined;
      questions = (prevQ?.questions as any[]) ?? standardQuestionSet(req.department);
      await db.insert(interviewQuestions).values({ reqId: req.id, questions, source: 'reused' });
    } catch (err) { console.error('[intake] backfill question copy failed:', err); }
    // Same JD is already approved -> open the role + send the kickoff immediately.
    await openRoleAndSendKickoff(db, req, jdTitle, baseJd?.id);
  } else {
    // Different JD (replacement/termination) or brand-new role (new_headcount).
    // generateRoleJD never throws (internal fallback), so a JD is always produced;
    // the insert is intentionally NOT swallowed so a real DB failure surfaces.
    const jd = await generateRoleJD({
      department: req.department, workArrangement: req.workArrangement,
      location: req.location, salaryMin: req.salaryMin, salaryMax: req.salaryMax,
      baseJd: baseJd ? { jobTitle: baseJd.jobTitle, summary: baseJd.summary, responsibilities: baseJd.responsibilities, requiredQualifications: baseJd.requiredQualifications, preferredQualifications: baseJd.preferredQualifications, workSampleInstructions: baseJd.workSampleInstructions, eppValues: (baseJd.eppValues as string[] | null) ?? [] } : null,
      changeNote: changeNote || null,
    });
    jdTitle = jd.jobTitle;

    // Work sample link: new headcount gets a freshly generated, department-scoped
    // task (Draft, pending curation) linked to the JD; replacement/termination
    // inherit the base JD's linked work sample when it has one.
    let workSampleTaskId: string | null = null;
    if (reason === 'new_headcount') {
      try {
        const ws = await generateWorkSampleTask({ department: req.department, jobTitle: jd.jobTitle, workSampleInstructions: jd.workSampleInstructions, jdSummary: jd.summary });
        const dept = await db.query.departments.findFirst({ where: eq(departments.name, req.department) });
        const [task] = await db.insert(assessmentTasks).values({
          title: `${jd.jobTitle} Work Sample`,
          departmentId: dept?.id ?? null,
          difficulty: ws.difficulty,
          timeLimitMin: ws.timeLimitMin,
          brief: ws.brief,
          showYourWorkInstructions: ws.showYourWorkInstructions,
          scoringGuideWork: ws.scoringGuideWork,
          scoringGuideAi: ws.scoringGuideAi,
          status: 'Draft',
        }).returning();
        workSampleTaskId = task?.id ?? null;
      } catch (err) { console.error('[intake] work-sample task generation failed:', err); }
    } else if (baseJd && (baseJd as any).workSampleTaskId) {
      workSampleTaskId = (baseJd as any).workSampleTaskId;
    }

    const [newJd] = await db.insert(jobDescriptions).values({
      reqId: req.id, jobTitle: jd.jobTitle, summary: jd.summary,
      responsibilities: jd.responsibilities, requiredQualifications: jd.requiredQualifications,
      preferredQualifications: jd.preferredQualifications, eppValues: jd.eppValues,
      workSampleInstructions: jd.workSampleInstructions, workSampleTaskId, status: 'Draft', pendingReview: true,
    }).returning();
    try {
      questions = await generateStandardQuestions({
        department: req.department, jobTitle: jd.jobTitle,
        jdSummary: jd.summary, jdResponsibilities: jd.responsibilities, jdQualifications: jd.requiredQualifications,
      });
      await db.insert(interviewQuestions).values({ reqId: req.id, questions, source: 'ai' });
    } catch (err) { console.error('[intake] question generation failed:', err); }
    try { await notifyJdReview(db, req, jdTitle, newJd.id); } catch (err) { console.error('[intake] JD-review notify failed:', err); }
    // New-JD reasons: the role stays closed and no kickoff is sent until the hiring
    // manager signs off on the JD (see approveJdAndOpenRole).
  }
}

const RoundInput = z.object({
  roundName: z.string().min(1).max(120),
  lengthMin: z.number().int().optional(),
  format: z.string().max(60).optional(),
  interviewer: z.string().max(200).optional(),
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
  baseJdId: z.string().uuid().nullable().optional(),
  approvalPlan: z.array(z.object({ role: z.string().min(1), concurrent: z.boolean().default(false) })).optional(),
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
  // Section 2A — role profile & search criteria (Jody feedback)
  mustHaves: z.string().optional(),
  niceToHaves: z.string().optional(),
  standoutSignals: z.string().optional(),
  dealbreakers: z.string().optional(),
  thriveProfile: z.string().optional(),
  struggleProfile: z.string().optional(),
  teamContext: z.string().optional(),
  targetCompanies: z.string().optional(),
  avoidCompanies: z.string().optional(),
  internalReferrals: z.string().optional(),
  // Section 4A — known constraints (ELT/Finance/HR)
  knownConstraints: z.string().optional(),
  constraintsAck: z.boolean().default(false),
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

// Fields the submitter may edit from the tokenized "sent back for edits" link.
const IntakeEditPatch = z.object({
  reasonType: z.enum(['backfill', 'new_headcount', 'replacement_diff', 'termination_diff']).optional(),
  roleChangeNote: z.string().optional(),
  department: z.string().min(1).max(200).optional(),
  hiringManager: z.string().min(1).max(200).optional(),
  numOpenings: z.number().int().min(1).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship']).optional(),
  location: z.string().max(200).optional(),
  workArrangement: z.enum(['On-site', 'Hybrid', 'Remote']).optional(),
  hybridDays: z.number().int().min(0).max(5).optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  variableComp: z.string().optional(),
  mustHaves: z.string().optional(),
  niceToHaves: z.string().optional(),
  standoutSignals: z.string().optional(),
  dealbreakers: z.string().optional(),
  knownConstraints: z.string().optional(),
  timelineTemplate: z.enum(['standard', 'senior', 'custom']).optional(),
  targetPostDate: z.string().optional(),
  targetOfferDate: z.string().optional(),
  teamAvailabilityConfirmed: z.boolean().optional(),
});

// Save submitter edits from the tokenized link. Only allowed while the intake is
// still editable (Changes Requested or Draft).
async function saveIntakeEdits(db: DrizzleClient, token: string, fields: Record<string, any>): Promise<{ ok: true }> {
  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, token) });
  if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This edit link is invalid or has expired.' });
  if (!(req.status === 'Changes Requested' || req.status === 'Draft')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This intake can no longer be edited from this link (it is already back in approval).' });
  }
  const clean: Record<string, any> = { ...fields };
  if ('targetPostDate' in clean) clean.targetPostDate = clean.targetPostDate || null;
  if ('targetOfferDate' in clean) clean.targetOfferDate = clean.targetOfferDate || null;
  if (Object.keys(clean).length) {
    await db.update(jobRequisitions).set({ ...clean, updatedAt: new Date() }).where(eq(jobRequisitions.id, token));
  }
  return { ok: true };
}

export const intakeRouter = router({
  // Latest reviewer note for a requisition that was sent back for edits (or
  // rejected), so the Intake + Requisitions edit views can surface "what to change".
  changesRequestedNote: protectedProcedure
    .input(z.object({ reqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, input.reqId)).orderBy(desc(approvals.actedAt));
      const cr = rows.find((r) => r.status === 'changes_requested');
      const rej = rows.find((r) => r.status === 'rejected');
      const hit = cr ?? rej;
      return { note: hit?.note ?? null, reviewedBy: hit?.approverRole ?? null, kind: cr ? ('changes_requested' as const) : (rej ? ('rejected' as const) : null) };
    }),

  // ── Submitter self-service edit via a tokenized link (token = requisition id) ──
  // Reached from the "sent back for edits" email so the hiring team can review and
  // fix the intake inline, then re-submit — no need to find the original form.
  editView: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const req = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.token) });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'This edit link is invalid or has expired.' });
      const [rounds, team, awareness, approvalRows] = await Promise.all([
        ctx.db.select().from(interviewPlan).where(eq(interviewPlan.reqId, input.token)).orderBy(asc(interviewPlan.sortOrder)),
        ctx.db.select().from(hiringTeam).where(eq(hiringTeam.reqId, input.token)),
        ctx.db.select().from(awarenessList).where(eq(awarenessList.reqId, input.token)),
        ctx.db.select().from(approvals).where(eq(approvals.reqId, input.token)).orderBy(asc(approvals.step)),
      ]);
      const sentBack = approvalRows
        .filter((r) => r.status === 'changes_requested')
        .sort((a, b) => (b.actedAt ? b.actedAt.getTime() : 0) - (a.actedAt ? a.actedAt.getTime() : 0))[0];
      return {
        requisition: req, rounds, team, awareness,
        reviewNote: sentBack?.note ?? null,
        reviewedBy: sentBack?.approverRole ?? null,
        status: req.status,
        canEdit: req.status === 'Changes Requested' || req.status === 'Draft',
      };
    }),

  editSave: publicProcedure
    .input(z.object({ token: z.string().uuid() }).merge(IntakeEditPatch))
    .mutation(async ({ ctx, input }) => {
      const { token, ...fields } = input;
      return saveIntakeEdits(ctx.db, token, fields);
    }),

  editResubmit: publicProcedure
    .input(z.object({ token: z.string().uuid() }).merge(IntakeEditPatch))
    .mutation(async ({ ctx, input }) => {
      const { token, ...fields } = input;
      await saveIntakeEdits(ctx.db, token, fields);
      const req = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, token) });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      const missing: string[] = [];
      if (!req.department) missing.push('department');
      if (!req.hiringManager) missing.push('hiring manager');
      if (req.salaryMin == null || req.salaryMax == null) missing.push('salary range');
      if (req.salaryMin != null && req.salaryMax != null && req.salaryMax < req.salaryMin) missing.push('salary range (max below min)');
      if (!req.teamAvailabilityConfirmed) missing.push('team availability confirmation');
      if (missing.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot re-submit — still missing: ${missing.join(', ')}.` });
      await ctx.db.update(jobRequisitions).set({ status: 'Pending Approval', updatedAt: new Date() }).where(eq(jobRequisitions.id, token));
      const rawPlan: Array<{ role: string; concurrent?: boolean }> =
        Array.isArray(req.approvalPlan) && (req.approvalPlan as any[]).length
          ? (req.approvalPlan as any[])
          : [ { role: 'Hiring Manager', concurrent: false }, { role: 'ELT Leader', concurrent: false }, { role: 'Finance', concurrent: false }, { role: 'HR', concurrent: false } ];
      let g = 0;
      const seedRows = rawPlan.map((p, i) => { if (i > 0 && !p.concurrent) g++; return { reqId: token, step: i + 1, approverRole: p.role, status: 'pending', groupIdx: g }; });
      await ctx.db.delete(approvals).where(eq(approvals.reqId, token));
      const inserted = await ctx.db.insert(approvals).values(seedRows).returning();
      const firstGroup = Math.min(...inserted.map((r: any) => r.groupIdx));
      for (const r of inserted.filter((r: any) => r.groupIdx === firstGroup)) { await notifyApprover(ctx.db, req, r); }
      return { ok: true as const, status: 'Pending Approval' as const };
    }),

  jdReviewView: publicProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const jd = (await ctx.db.select().from(jobDescriptions).where(eq(jobDescriptions.id, input.token)))[0];
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND', message: 'This review link is invalid or has expired.' });
      const req = jd.reqId ? await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) }) : null;
      const qRow = (await ctx.db.select().from(interviewQuestions)
        .where(eq(interviewQuestions.reqId, jd.reqId))
        .orderBy(desc(interviewQuestions.createdAt)).limit(1))[0];
      return {
        jd,
        department: req?.department ?? null,
        hiringManager: req?.hiringManager ?? null,
        alreadyDecided: !(jd as any).pendingReview,
        questions: (qRow?.questions as any[]) ?? [],
      };
    }),

  jdReviewApprove: publicProcedure
    .input(z.object({ token: z.string().uuid(), approverName: z.string().optional(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const jd = await approveJdAndOpenRole(ctx.db, input.token);
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND', message: 'This review link is invalid.' });
      return { ok: true as const, jobTitle: jd.jobTitle };
    }),

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
          rounds.map((r, i) => ({ reqId, roundName: r.roundName, lengthMin: r.lengthMin, format: r.format, interviewer: r.interviewer, sortOrder: i })),
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

      // Seed the approval chain from the configured plan (or the default 4).
      // Concurrency: rows are grouped — a row "concurrent with previous" shares
      // the prior row's group; a "dependent" row starts a new group. Groups are
      // actioned in order; within a group everyone is notified together and the
      // chain advances only when the whole group has approved.
      const rawPlan: Array<{ role: string; concurrent?: boolean }> =
        Array.isArray(req.approvalPlan) && (req.approvalPlan as any[]).length
          ? (req.approvalPlan as any[])
          : [
              { role: 'Hiring Manager', concurrent: false },
              { role: 'ELT Leader', concurrent: false },
              { role: 'Finance', concurrent: false },
              { role: 'HR', concurrent: false },
            ];
      let g = 0;
      const seedRows = rawPlan.map((p, i) => {
        if (i > 0 && !p.concurrent) g++;
        return { reqId: input.id, step: i + 1, approverRole: p.role, status: 'pending', groupIdx: g };
      });
      await ctx.db.delete(approvals).where(eq(approvals.reqId, input.id));
      const insertedApprovals = await ctx.db.insert(approvals).values(seedRows).returning();

      const notifyErrors: string[] = [];
      // Notify everyone in the first group only.
      const firstGroup = Math.min(...insertedApprovals.map((r: any) => r.groupIdx));
      for (const r of insertedApprovals.filter((r: any) => r.groupIdx === firstGroup)) {
        const e = await notifyApprover(ctx.db, req, r);
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

  // Standard interview questions for a requisition (shown on its JD).
  questionsForReq: protectedProcedure
    .input(z.object({ reqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = (await ctx.db.select().from(interviewQuestions)
        .where(eq(interviewQuestions.reqId, input.reqId))
        .orderBy(desc(interviewQuestions.createdAt)).limit(1))[0];
      return { questions: (row?.questions as any[]) ?? [], source: row?.source ?? null };
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
      const pendingRows = chainRows.filter((r) => r.status === 'pending');
      const activeGroup = pendingRows.length ? Math.min(...pendingRows.map((r) => r.groupIdx)) : -1;
      return {
        approvalId: target.id,
        step: target.step,
        roleLabel: target.approverRole,
        stepStatus: target.status,
        isCurrentStep: target.status === 'pending' && target.groupIdx === activeGroup,
        overallStatus: req.status,
        requisition: req,
        rounds, team, awareness,
        chain: chainRows.map((r) => ({ step: r.step, roleLabel: r.approverRole, status: r.status, note: r.note, group: r.groupIdx })),
      };
    }),

  approveViaToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid.' });
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, target.reqId)).orderBy(asc(approvals.step));
      if (target.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This step has already been decided.' });
      const pending = rows.filter((r) => r.status === 'pending');
      const activeGroup = pending.length ? Math.min(...pending.map((r) => r.groupIdx)) : -1;
      if (target.groupIdx !== activeGroup) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'An earlier group of approvers still needs to sign off before this one.' });
      }
      await ctx.db.update(approvals).set({ status: 'approved', approverRef: 'via approval link', note: input.note ?? target.note, actedAt: new Date() }).where(eq(approvals.id, target.id));
      if (target.approverRole.toLowerCase().includes('finance')) {
        await ctx.db.update(jobRequisitions).set({ financeConfirmed: true, updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
      }
      const restPending = rows.filter((r) => r.id !== target.id && r.status === 'pending');
      if (!restPending.length) {
        await ctx.db.update(jobRequisitions).set({ status: 'Approved', updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
        const approvedReq = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, target.reqId) });
        if (approvedReq) await runKickoffAndPosting(ctx.db, approvedReq);
      } else {
        const newActive = Math.min(...restPending.map((r) => r.groupIdx));
        if (newActive > activeGroup) {
          const reqRow = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, target.reqId) });
          if (reqRow) for (const r of restPending.filter((r) => r.groupIdx === newActive)) await notifyApprover(ctx.db, reqRow, r);
        }
      }
      return { ok: true as const, fullyApproved: !restPending.length, roleLabel: target.approverRole };
    }),

  rejectViaToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), note: z.string().min(1, 'A reason is required to reject.') }))
    .mutation(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid.' });
      await ctx.db.update(approvals).set({ status: 'rejected', approverRef: 'via approval link', note: input.note, actedAt: new Date() }).where(eq(approvals.id, target.id));
      await ctx.db.update(jobRequisitions).set({ status: 'Rejected', updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
      await notifyIntakeRejected(ctx.db, target.reqId, target.approverRole, input.note);
      return { ok: true as const, roleLabel: target.approverRole };
    }),

  // Approve the current step in the sequence. Enforces order (must be the
  // lowest pending step). Finance approval sets finance_confirmed; the final
  // approval moves the intake to Approved (slice 3 fires the kickoff here).
  approve: protectedProcedure
    .input(z.object({ reqId: z.string().uuid(), step: z.number().int(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, input.reqId)).orderBy(asc(approvals.step));
      if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'No approval chain — submit the intake first.' });
      const pending = rows.filter((r) => r.status === 'pending');
      if (!pending.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This intake is already fully decided.' });
      const activeGroup = Math.min(...pending.map((r) => r.groupIdx));
      const target = rows.find((r) => r.step === input.step);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
      if (target.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'That step is already decided.' });
      if (target.groupIdx !== activeGroup) throw new TRPCError({ code: 'BAD_REQUEST', message: 'An earlier group of approvers still needs to sign off.' });

      await ctx.db.update(approvals)
        .set({ status: 'approved', approverRef: ctx.user.id, note: input.note ?? target.note, actedAt: new Date() })
        .where(eq(approvals.id, target.id));
      if (target.approverRole.toLowerCase().includes('finance')) {
        await ctx.db.update(jobRequisitions).set({ financeConfirmed: true, updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      }
      const restPending = rows.filter((r) => r.id !== target.id && r.status === 'pending');
      if (!restPending.length) {
        await ctx.db.update(jobRequisitions).set({ status: 'Approved', updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
        const approvedReq = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.reqId) });
        if (approvedReq) await runKickoffAndPosting(ctx.db, approvedReq);
      } else {
        const newActive = Math.min(...restPending.map((r) => r.groupIdx));
        if (newActive > activeGroup) {
          const reqRow = await ctx.db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, input.reqId) });
          if (reqRow) for (const r of restPending.filter((r) => r.groupIdx === newActive)) await notifyApprover(ctx.db, reqRow, r);
        }
      }
      await auditChange(ctx.db, ctx.user.id, input.reqId, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'approve_intake', 'job_requisitions', { reqId: input.reqId, step: input.step }).catch(() => {});
      return { id: input.reqId, fullyApproved: !restPending.length };
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
      await ctx.db.update(jobRequisitions).set({ status: 'Rejected', updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      await notifyIntakeRejected(ctx.db, input.reqId, target.approverRole, input.note);
      await auditChange(ctx.db, ctx.user.id, input.reqId, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'reject_intake', 'job_requisitions', { reqId: input.reqId, step: input.step }).catch(() => {});
      return { id: input.reqId };
    }),

  // Send back for EDITS (not a rejection): records a note, marks the step
  // "changes_requested", and sets the intake to "Changes Requested" so it can be
  // revised and re-submitted — without showing as Rejected in the status column.
  sendBack: protectedProcedure
    .input(z.object({ reqId: z.string().uuid(), step: z.number().int(), note: z.string().min(1, 'A note is required to send back for edits.') }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(approvals).where(eq(approvals.reqId, input.reqId)).orderBy(asc(approvals.step));
      const target = rows.find((r) => r.step === input.step);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.update(approvals)
        .set({ status: 'changes_requested', approverRef: ctx.user.id, note: input.note, actedAt: new Date() })
        .where(eq(approvals.id, target.id));
      await ctx.db.update(jobRequisitions).set({ status: 'Changes Requested', updatedAt: new Date() }).where(eq(jobRequisitions.id, input.reqId));
      await notifyIntakeSentBack(ctx.db, input.reqId, target.approverRole, input.note);
      await auditChange(ctx.db, ctx.user.id, input.reqId, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'send_back_intake', 'job_requisitions', { reqId: input.reqId, step: input.step }).catch(() => {});
      return { id: input.reqId };
    }),

  sendBackViaToken: publicProcedure
    .input(z.object({ token: z.string().uuid(), note: z.string().min(1, 'A note is required to send back for edits.') }))
    .mutation(async ({ ctx, input }) => {
      const target = (await ctx.db.select().from(approvals).where(eq(approvals.id, input.token)))[0];
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'This approval link is invalid.' });
      await ctx.db.update(approvals)
        .set({ status: 'changes_requested', approverRef: 'via approval link', note: input.note, actedAt: new Date() })
        .where(eq(approvals.id, target.id));
      await ctx.db.update(jobRequisitions).set({ status: 'Changes Requested', updatedAt: new Date() }).where(eq(jobRequisitions.id, target.reqId));
      await notifyIntakeSentBack(ctx.db, target.reqId, target.approverRole, input.note);
      return { ok: true as const, roleLabel: target.approverRole };
    }),
});
