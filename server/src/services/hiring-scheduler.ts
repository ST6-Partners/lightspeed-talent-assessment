// ============================================================
// HIRING SCHEDULER — Assessment reminder + auto-reject jobs
//
// Registers two jobs with the job-runner:
//   assessment-reminder   — 7-day email nudge (cron: 9am CT daily)
//   assessment-auto-reject — 14-day auto-reject (cron: 9am CT daily)
//
// Uses assessmentSentAt if set, falls back to candidate_stage_history
// entry for the Assessment stage transition.
// ============================================================

import { eq, and, lte, gte, lt, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db.js';
import { candidates, candidateStageHistory, emailLog, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { approvals } from '../db/schema/intake.js';
import { registerJob, rescheduleCronJob, type JobResult } from './job-runner.js';
import { rankNewApplicants } from './candidateRanking.js';
import { inboundEmails } from '../db/schema/email.js';
import { sendEmail, emailBookingReminderCandidate, emailBookingStalledHR } from './email.js';
import { computeHiringAlerts, renderAlertDigest } from './hiring-alerts.js';
import { approverEmail, emailApprovalReminder, emailInterviewReminderCandidate, emailInterviewReminderInterviewer, emailPostingOpenedExternal, HIRING_TEAM_INBOX } from './email.js';
import { getPostingWindows, writeExternalOpenMarker } from './posting.js';
import { emailMetricsReport } from './email.js';
import { buildPeriodMetrics } from './reportMetrics.js';
import { getReportConfig, cronForReport } from './reportConfig.js';
import { emailScorecardReminder } from './email.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { businessHoursBetween } from '../routers/interviews.js';
import { valueReviews } from '../db/schema/values.js';

function schedAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

// ── Helpers ────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function alreadySentTemplate(candidateId: string, template: string): Promise<boolean> {
  const row = await db.query.emailLog.findFirst({
    where: and(
      eq(emailLog.candidateId, candidateId),
      eq(emailLog.template, template),
      eq(emailLog.status, 'sent'),
    ),
  });
  return !!row;
}

async function logEmail(
  candidateId: string,
  recipient: string,
  template: string,
  subject: string,
  status: 'sent' | 'failed',
  error?: string,
) {
  await db.insert(emailLog).values({
    candidateId,
    recipient,
    template,
    subject,
    status,
    error: error ?? null,
    sentAt: status === 'sent' ? new Date() : null,
  });
}

// Returns the date the candidate entered Assessment stage.
// Prefers assessmentSentAt; falls back to stage_history.
async function getAssessmentStartDate(candidateId: string, assessmentSentAt: Date | null): Promise<Date | null> {
  if (assessmentSentAt) return assessmentSentAt;

  const historyRow = await db.query.candidateStageHistory.findFirst({
    where: and(
      eq(candidateStageHistory.candidateId, candidateId),
      eq(candidateStageHistory.toStage, 'Assessment'),
    ),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  return historyRow?.createdAt ?? null;
}

// ── Job: 7-day assessment reminder ────────────────────────

async function runAssessmentReminder({ force = false }: { force?: boolean } = {}) {
  const sevenDaysAgo = daysAgo(7);
  const fourteenDaysAgo = daysAgo(14);

  // All candidates currently in Assessment stage
  const inAssessment = await db.query.candidates.findMany({
    where: eq(candidates.currentStage, 'Assessment'),
  });

  let affected = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const candidate of inAssessment) {
    try {
      const startDate = await getAssessmentStartDate(candidate.id, candidate.assessmentSentAt);
      if (!startDate) { skipped.push(`${candidate.email} (no start date)`); continue; }

      // Only target 7–13 days window
      if (startDate > sevenDaysAgo) { skipped.push(`${candidate.email} (too recent)`); continue; }
      if (startDate <= fourteenDaysAgo) { skipped.push(`${candidate.email} (past 14-day cutoff)`); continue; }

      // Skip if reminder already sent (unless forced)
      if (!force && await alreadySentTemplate(candidate.id, 'assessment_reminder')) {
        skipped.push(`${candidate.email} (already sent)`);
        continue;
      }

      // Get job title
      const jd = candidate.jdId
        ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const jobTitle = jd?.jobTitle ?? 'the position';

      const subject = `Reminder: Complete your assessment — ${jobTitle}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a;">
          <h2>Don't miss your chance</h2>
          <p>Hi ${candidate.firstName},</p>
          <p>This is a friendly reminder that your assessment for <strong>${jobTitle}</strong> at Lightspeed Systems is still pending.</p>
          <p>You have <strong>one week remaining</strong> to complete it. Candidates who don't finish the assessment within 14 days are automatically removed from consideration.</p>
          <p>If you have any issues accessing the assessment, reply to this email.</p>
          <p>Best,<br/>Lightspeed Systems Recruiting</p>
        </div>
      `;

      await sendEmail({ to: candidate.email, subject, html, templateId: 'assessment_reminder' });
      await logEmail(candidate.id, candidate.email, 'assessment_reminder', subject, 'sent');
      affected++;
    } catch (err: any) {
      errors.push(`${candidate.email}: ${err.message}`);
      try {
        const subject = 'Reminder: Complete your assessment';
        await logEmail(candidate.id, candidate.email, 'assessment_reminder', subject, 'failed', err.message);
      } catch (logErr) { console.warn('[hiring-scheduler] failed to record assessment-reminder email failure (non-blocking):', logErr); }
    }
  }

  const details = [
    `Reminded: ${affected}`,
    skipped.length ? `Skipped: ${skipped.join(', ')}` : null,
    errors.length ? `Errors: ${errors.join('; ')}` : null,
  ].filter(Boolean).join(' | ');

  return { affected, details };
}

// ── Job: 14-day assessment auto-reject ────────────────────

async function runAssessmentAutoReject({ force = false }: { force?: boolean } = {}) {
  const fourteenDaysAgo = daysAgo(14);

  const inAssessment = await db.query.candidates.findMany({
    where: eq(candidates.currentStage, 'Assessment'),
  });

  let affected = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const candidate of inAssessment) {
    try {
      const startDate = await getAssessmentStartDate(candidate.id, candidate.assessmentSentAt);
      if (!startDate) { skipped.push(`${candidate.email} (no start date)`); continue; }

      // Only target candidates 14+ days in Assessment
      if (startDate > fourteenDaysAgo) { skipped.push(`${candidate.email} (not yet 14 days)`); continue; }

      const jd = candidate.jdId
        ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const jobTitle = jd?.jobTitle ?? 'the position';

      // 1. Advance to Rejected
      await db.update(candidates)
        .set({
          currentStage: 'Rejected',
          rejectionReason: 'Assessment not completed within 14 days',
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, candidate.id));

      // 2. Log stage change
      await db.insert(candidateStageHistory).values({
        candidateId: candidate.id,
        fromStage: 'Assessment',
        toStage: 'Rejected',
        changedBy: null,
        reason: 'Assessment not completed within 14 days (automated)',
      });

      // 3. Send rejection email
      const subject = `Your application with Lightspeed Systems — ${jobTitle}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a;">
          <h2>Update on your application</h2>
          <p>Hi ${candidate.firstName},</p>
          <p>Thank you for your interest in the <strong>${jobTitle}</strong> position at Lightspeed Systems.</p>
          <p>Unfortunately, as the required assessment was not completed within the 14-day window, we are unable to move your application forward at this time.</p>
          <p>We encourage you to apply for future openings. Thank you for considering Lightspeed Systems.</p>
          <p>Best,<br/>Lightspeed Systems Recruiting</p>
        </div>
      `;

      await sendEmail({ to: candidate.email, subject, html, templateId: 'assessment_auto_reject' });
      await logEmail(candidate.id, candidate.email, 'assessment_auto_reject', subject, 'sent');
      affected++;
    } catch (err: any) {
      errors.push(`${candidate.email}: ${err.message}`);
    }
  }

  const details = [
    `Auto-rejected: ${affected}`,
    skipped.length ? `Skipped: ${skipped.join(', ')}` : null,
    errors.length ? `Errors: ${errors.join('; ')}` : null,
  ].filter(Boolean).join(' | ');

  return { affected, details };
}

// ── Register with job-runner ───────────────────────────────

// ── Job: interview booking reminder + stall alert ──────────
// For candidates whose scheduling was opened but who haven't booked:
//   >= 1 day open, no booking, no reminder yet  → nudge the candidate
//   >= 2 days open, no booking, no HR alert yet → flag HR (past the ~48h window)
async function runInterviewBookingReminder({ force = false }: { force?: boolean } = {}): Promise<JobResult> {
  // The booking window counts business hours only — weekends don't burn it.
  // Nudge the candidate after 1 business day (24 business hours) and flag HR
  // after 2 business days (48 business hours) of the window being open.
  const NUDGE_BIZ_HOURS = 24;
  const HR_FLAG_BIZ_HOURS = 48;

  const rows = await db.query.candidates.findMany({
    where: and(isNotNull(candidates.interviewBookingOpenedAt), isNull(candidates.interviewScheduledAt)),
  });

  let nudged = 0;
  let flagged = 0;
  const skipped: string[] = [];

  for (const candidate of rows) {
    const openedAt = candidate.interviewBookingOpenedAt as Date | null;
    if (!openedAt) { continue; }
    if (['Rejected', 'Hired', 'Not Selected', 'Phone Screen', 'Interview Scheduled', 'Interviewed', 'Offered'].includes(candidate.currentStage)) {
      skipped.push(`${candidate.email} (stage ${candidate.currentStage})`); continue;
    }

    const jd = candidate.jdId
      ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
      : null;
    const jobTitle = jd?.jobTitle ?? undefined;
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;
    const daysOpen = Math.floor((Date.now() - openedAt.getTime()) / 86_400_000);
    // Business hours the window has been open (Mon–Fri only; weekends excluded).
    const bizHoursOpen = businessHoursBetween(openedAt.getTime(), Date.now());

    // Candidate nudge at >= 1 business day open.
    if (bizHoursOpen >= NUDGE_BIZ_HOURS && candidate.interviewBookingToken) {
      if (force || !(await alreadySentTemplate(candidate.id, 'interview_booking_reminder'))) {
        const bookingUrl = `${schedAppBaseUrl()}/book-interview/${candidate.interviewBookingToken}`;
        try {
          await emailBookingReminderCandidate({ email: candidate.email, firstName: candidate.firstName, jobTitle, bookingUrl });
          await logEmail(candidate.id, candidate.email, 'interview_booking_reminder', `Reminder: book your interview`, 'sent');
          nudged++;
        } catch (err: any) {
          await logEmail(candidate.id, candidate.email, 'interview_booking_reminder', 'Reminder: book your interview', 'failed', err?.message);
        }
      }
    }

    // HR stall alert at >= 2 business days (the ~48 business-hour window).
    if (bizHoursOpen >= HR_FLAG_BIZ_HOURS) {
      if (force || !(await alreadySentTemplate(candidate.id, 'interview_booking_stalled_hr'))) {
        try {
          await emailBookingStalledHR({ candidateName, jobTitle, daysOpen });
          await logEmail(candidate.id, process.env.HR_EMAIL ?? 'hr', 'interview_booking_stalled_hr', `Interview not booked: ${candidateName}`, 'sent');
          flagged++;
        } catch (err: any) {
          await logEmail(candidate.id, process.env.HR_EMAIL ?? 'hr', 'interview_booking_stalled_hr', `Interview not booked: ${candidateName}`, 'failed', err?.message);
        }
      }
    }
  }

  return { affected: nudged + flagged, details: `Nudged ${nudged} candidate(s); flagged ${flagged} to HR.${skipped.length ? ` Skipped ${skipped.length}.` : ''}` };
}

// ── Job: daily hiring timeline alerts (flowchart node X) ──
async function runTimelineAlerts(): Promise<JobResult> {
  const alerts = await computeHiringAlerts(db);
  const total = alerts.stalledCandidates.length + alerts.overdueReqs.length;
  if (total === 0) {
    return { affected: 0, details: 'No timeline alerts — all candidates within stage SLA and all reqs within timeline.' };
  }

  const to = process.env.HR_EMAIL || process.env.EMAIL_FROM || 'hr@lightspeedsystems.com';
  const subject = `Hiring timeline alerts — ${alerts.stalledCandidates.length} stalled candidate(s), ${alerts.overdueReqs.length} overdue req(s)`;
  const html = renderAlertDigest(alerts);

  try {
    await sendEmail({ to, subject, html, templateId: 'timeline_alerts' });
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
      toEmail: to, subject, body: html, replyTag: 'timeline_alerts', source: 'simulated', raw: { kind: 'timeline_alerts' },
    });
  } catch (err) { console.error('[timeline-alerts] send failed:', err); }

  return { affected: total, details: `${alerts.stalledCandidates.length} stalled candidate(s), ${alerts.overdueReqs.length} overdue req(s) — digest emailed to ${to}.` };
}

// ── Job: stalled-approval reminder (approval chain SLA) ────
// Nudges approvers in the ACTIVE group whose pending step is >= 3 days old;
// escalates to HR at >= 5 days. Only the active group is actionable.
const APPROVAL_REMINDER_DAYS = 3;
const APPROVAL_ESCALATE_DAYS = 5;

async function runApprovalReminder(): Promise<JobResult> {
  const pending = await db.select().from(approvals).where(eq(approvals.status, 'pending'));
  if (!pending.length) return { affected: 0, details: 'No pending approvals.' };

  // Group pending approvals by req, and only act on each req's active (lowest) group.
  const byReq = new Map<string, typeof pending>();
  for (const a of pending) {
    const arr = byReq.get(a.reqId) ?? [];
    arr.push(a);
    byReq.set(a.reqId, arr as any);
  }

  let nudged = 0, escalated = 0;
  const now = Date.now();
  for (const [reqId, rows] of byReq) {
    const activeGroup = Math.min(...rows.map((r) => r.groupIdx));
    const active = rows.filter((r) => r.groupIdx === activeGroup);
    const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, reqId) });
    if (!req) continue;

    for (const a of active) {
      const created = a.createdAt ? new Date(a.createdAt).getTime() : now;
      const daysPending = Math.floor((now - created) / 86_400_000);
      if (daysPending < APPROVAL_REMINDER_DAYS) continue;

      const approvalUrl = `${schedAppBaseUrl()}/approve/${a.id}`;
      try {
        await emailApprovalReminder(approverEmail(a.approverRole), {
          roleLabel: a.approverRole, department: req.department, hiringManager: req.hiringManager,
          daysPending, approvalUrl,
        });
        nudged++;
      } catch (err) { console.error('[approval-reminder] approver send failed:', err); }

      if (daysPending >= APPROVAL_ESCALATE_DAYS) {
        try {
          await emailApprovalReminder(process.env.HR_EMAIL || approverEmail('hr'), {
            roleLabel: `${a.approverRole} (escalation)`, department: req.department, hiringManager: req.hiringManager,
            daysPending, approvalUrl,
          });
          escalated++;
        } catch (err) { console.error('[approval-reminder] HR escalation failed:', err); }
      }
    }
  }
  return { affected: nudged + escalated, details: `Nudged ${nudged} approver(s); escalated ${escalated} to HR.` };
}

// ── Job: day-before interview reminder (candidate + interviewer) ──
async function runInterviewDayBeforeReminder({ force = false }: { force?: boolean } = {}): Promise<JobResult> {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + 1); // start of tomorrow
  const end = new Date(start); end.setDate(end.getDate() + 1);                                // start of day after

  const rows = await db.query.candidates.findMany({
    where: and(
      isNotNull(candidates.interviewScheduledAt),
      gte(candidates.interviewScheduledAt, start),
      lt(candidates.interviewScheduledAt, end),
    ),
  });

  let candSent = 0, intSent = 0;
  const skipped: string[] = [];
  for (const c of rows) {
    if (['Rejected', 'Hired', 'Not Selected'].includes(c.currentStage)) { skipped.push(`${c.email} (stage ${c.currentStage})`); continue; }
    if (!force && await alreadySentTemplate(c.id, 'interview_reminder_candidate')) { skipped.push(`${c.email} (already reminded)`); continue; }

    const jd = c.jdId ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, c.jdId) }) : null;
    const jobTitle = jd?.jobTitle ?? undefined;
    const whenText = c.interviewScheduledAt
      ? new Date(c.interviewScheduledAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : undefined;

    try {
      await emailInterviewReminderCandidate({ firstName: c.firstName, lastName: c.lastName, email: c.email, jobTitle, interviewerName: c.interviewerName ?? undefined, whenText });
      await logEmail(c.id, c.email, 'interview_reminder_candidate', `Reminder: your interview tomorrow`, 'sent');
      candSent++;
    } catch (err: any) {
      await logEmail(c.id, c.email, 'interview_reminder_candidate', 'Reminder: your interview tomorrow', 'failed', err?.message);
    }

    if (c.interviewerEmail) {
      try {
        await emailInterviewReminderInterviewer({ interviewerEmail: c.interviewerEmail, interviewerName: c.interviewerName, candidateName: `${c.firstName} ${c.lastName}`, jobTitle, whenText });
        intSent++;
      } catch (err) { console.error('[interview-reminder] interviewer send failed:', err); }
    }
  }
  return { affected: candSent + intSent, details: `Reminded ${candSent} candidate(s) + ${intSent} interviewer(s).${skipped.length ? ` Skipped ${skipped.length}.` : ''}` };
}

// ── Job: posting window flip (internal-first -> external) ──
async function runPostingWindowFlip(): Promise<JobResult> {
  const openReqs = await db.query.jobRequisitions.findMany({ where: eq(jobRequisitions.status, 'Open') });
  const windows = await getPostingWindows(db, openReqs.map((r) => r.id));
  let flipped = 0;
  for (const r of openReqs) {
    const w = windows[r.id];
    if (!w || w.externallyOpened || w.phase !== 'external' || !w.windowStart) continue; // window not elapsed / already opened
    const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.reqId, r.id) });
    const jobTitle = jd?.jobTitle ?? `${r.department} role`;
    try {
      await db.update(jobRequisitions).set({ externalOpenedAt: new Date(), updatedAt: new Date() }).where(eq(jobRequisitions.id, r.id));
      await writeExternalOpenMarker(db, r.id, jobTitle, r.department, 'auto');
      await emailPostingOpenedExternal(HIRING_TEAM_INBOX, { jobTitle, department: r.department, mode: 'auto' }).catch((err) => console.warn('[email] emailPostingOpenedExternal failed (non-blocking):', err));
      flipped++;
    } catch (err) { console.error('[posting-flip] failed:', err); }
  }
  return { affected: flipped, details: flipped ? `Flipped ${flipped} role(s) to external.` : 'No roles due to open externally.' };
}

// ── Job: scheduled weekly / quarterly metrics report ──────
// Off by default (opt-in recipients + toggle in the Metrics tab). Sends a
// headline hiring digest with change-vs-prior-period deltas.

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function runWeeklyReport(): Promise<JobResult> {
  const cfg = await getReportConfig(db, 'weekly').catch(() => ({ enabled: false, recipients: [] as string[] }));
  if (!cfg.enabled || cfg.recipients.length === 0) return { affected: 0, details: 'Weekly report disabled or no recipients.' };

  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 7);
  const prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 7);
  const cur = await buildPeriodMetrics(db, from.toISOString(), now.toISOString());
  const prev = await buildPeriodMetrics(db, prevFrom.toISOString(), from.toISOString());
  const periodLabel = `Week of ${fmtDate(from)} – ${fmtDate(now)}`;
  const appUrl = schedAppBaseUrl() ? `${schedAppBaseUrl()}/hiring/metrics` : undefined;

  let sent = 0;
  for (const to of cfg.recipients) {
    try {
      await emailMetricsReport({ to, subject: `Weekly hiring report — ${periodLabel}`, periodLabel, cadence: 'weekly', metrics: cur, compareLabel: 'vs prior week', compare: prev, appUrl });
      sent++;
    } catch (err) { console.error('[weekly-report] send failed for', to, err); }
  }
  return { affected: sent, details: `Weekly report sent to ${sent}/${cfg.recipients.length} recipient(s) — ${periodLabel}.` };
}

async function runQuarterlyReport(): Promise<JobResult> {
  const cfg = await getReportConfig(db, 'quarterly').catch(() => ({ enabled: false, recipients: [] as string[] }));
  if (!cfg.enabled || cfg.recipients.length === 0) return { affected: 0, details: 'Quarterly report disabled or no recipients.' };

  const now = new Date();
  const qStartMonth = Math.floor(now.getMonth() / 3) * 3;           // current quarter's first month
  const thisQ = new Date(now.getFullYear(), qStartMonth, 1);
  const prevQ = new Date(now.getFullYear(), qStartMonth - 3, 1);    // the quarter that just ended
  const prevPrevQ = new Date(now.getFullYear(), qStartMonth - 6, 1);
  const cur = await buildPeriodMetrics(db, prevQ.toISOString(), thisQ.toISOString());
  const prev = await buildPeriodMetrics(db, prevPrevQ.toISOString(), prevQ.toISOString());
  const q = Math.floor(prevQ.getMonth() / 3) + 1;
  const periodLabel = `Q${q} ${prevQ.getFullYear()}`;
  const appUrl = schedAppBaseUrl() ? `${schedAppBaseUrl()}/hiring/metrics` : undefined;

  let sent = 0;
  for (const to of cfg.recipients) {
    try {
      await emailMetricsReport({ to, subject: `Quarterly hiring report — ${periodLabel}`, periodLabel, cadence: 'quarterly', metrics: cur, compareLabel: 'vs prior quarter', compare: prev, appUrl });
      sent++;
    } catch (err) { console.error('[quarterly-report] send failed for', to, err); }
  }
  return { affected: sent, details: `Quarterly report sent to ${sent}/${cfg.recipients.length} recipient(s) — ${periodLabel}.` };
}

// ── Job: scorecard reminder ────────────────────────────────
// After an interview round has happened, nudge the interviewer hourly until
// they submit the scorecard (a value_reviews row tied to that round). Stops
// automatically once filled, once the candidate is terminal, or after 14 days.
const SCORECARD_TERMINAL = ['Rejected', 'Hired', 'Not Selected'];
const SCORECARD_FIRST_NUDGE_MS = 45 * 60 * 1000; // wait ~45 min before the first nudge
const SCORECARD_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

async function runScorecardReminder(): Promise<JobResult> {
  const now = Date.now();
  const rounds = await db.select().from(candidateInterviews);
  let sent = 0;

  for (const r of rounds as any[]) {
    if (!r.interviewerEmail) continue;
    const scheduled = r.scheduledAt ? new Date(r.scheduledAt).getTime() : null;
    const happened = r.status === 'completed' || (scheduled != null && scheduled <= now);
    if (!happened) continue;

    // Reference time the interview took place (best available).
    const ref = scheduled ?? (r.updatedAt ? new Date(r.updatedAt).getTime() : (r.createdAt ? new Date(r.createdAt).getTime() : now));
    const waited = now - ref;
    if (waited < SCORECARD_FIRST_NUDGE_MS) continue; // too soon
    if (waited > SCORECARD_MAX_AGE_MS) continue;      // give up nagging on ancient rounds

    // Already scored? (a value_reviews row tied to this round)
    const review = (await db.select().from(valueReviews).where(eq(valueReviews.interviewId, r.id)).limit(1))[0];
    if (review) continue;

    const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, r.candidateId) });
    if (!candidate || SCORECARD_TERMINAL.includes(candidate.currentStage as string)) continue;

    const jd = candidate.jdId
      ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
      : null;
    const base = schedAppBaseUrl();
    const scorecardUrl = `${base}/hiring/scorecards?id=${candidate.id}&round=${r.id}`;
    const hoursWaiting = Math.max(1, Math.floor(waited / 3_600_000));

    try {
      await emailScorecardReminder({
        to: r.interviewerEmail,
        interviewerName: r.interviewerName,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: jd?.jobTitle ?? undefined,
        roundName: r.roundName,
        scorecardUrl,
        hoursWaiting,
      });
      sent++;
    } catch (err) { console.error('[scorecard-reminder] send failed for round', r.id, err); }
  }
  return { affected: sent, details: sent ? `Nudged ${sent} interviewer(s) with an open scorecard.` : 'No open scorecards needing a nudge.' };
}

// Apply each report's stored day/time to its cron job. Called once at
// boot (after startCronJobs) and again whenever an admin saves a new
// schedule, so the change takes effect without a server restart.
export async function applyReportSchedules(): Promise<void> {
  for (const cadence of ['weekly', 'quarterly'] as const) {
    try {
      const cfg = await getReportConfig(db, cadence);
      rescheduleCronJob(`${cadence}-metrics-report`, cronForReport(cadence, cfg.schedule));
    } catch (err) {
      console.warn(`[hiring-scheduler] failed to apply ${cadence} report schedule:`, err);
    }
  }
}

export function registerHiringJobs(): void {
  registerJob({
    name:           'rank-new-applicants',
    label:          'Rank New Applicants',
    description:    'Backstop for live ranking: scores any in-pool applicant that is missing a ranking for an actively-ranked role.',
    color:          '#8b5cf6',
    jobType:        'cron',
    cronExpression: '* * * * *',   // every minute
    handler:        async (): Promise<JobResult> => rankNewApplicants(db),
  });
  registerJob({
    name:           'assessment-reminder',
    label:          'Assessment Reminder',
    description:    'Email candidates who have been in Assessment stage for 7–13 days without completing it.',
    color:          '#f59e0b',
    jobType:        'cron',
    cronExpression: '0 9 * * *',   // 9:00 AM daily (Railway server time)
    handler:        runAssessmentReminder,
  });

  registerJob({
    name:           'assessment-auto-reject',
    label:          'Assessment Auto-Reject',
    description:    'Auto-reject and notify candidates who have been in Assessment stage for 14+ days without completing it.',
    color:          '#ef4444',
    jobType:        'cron',
    cronExpression: '5 9 * * *',   // 9:05 AM daily (5 min after reminder)
    handler:        runAssessmentAutoReject,
  });
  registerJob({
    name:           'interview-booking-reminder',
    label:          'Interview Booking Reminder',
    description:    'Nudge candidates who were invited to book an interview but haven\'t, and flag HR when a booking stalls past the ~48h window.',
    color:          '#0ea5e9',
    jobType:        'cron',
    cronExpression: '10 9 * * *',  // 9:10 AM daily
    handler:        runInterviewBookingReminder,
  });
  registerJob({
    name:           'hiring-timeline-alerts',
    label:          'Hiring Timeline Alerts',
    description:    'Daily scan for candidates sitting too long in a stage and requisitions past their timeline; emails HR a digest when anything is flagged.',
    color:          '#38bdf8',
    jobType:        'cron',
    cronExpression: '15 9 * * *',  // 9:15 AM daily (after reminder + auto-reject + booking reminder)
    handler:        runTimelineAlerts,
  });
  registerJob({
    name:           'approval-reminder',
    label:          'Approval Reminder',
    description:    'Nudge approvers whose pending intake approval is 3+ days old; escalate to HR at 5+ days.',
    color:          '#a855f7',
    jobType:        'cron',
    cronExpression: '20 9 * * *',  // 9:20 AM daily
    handler:        runApprovalReminder,
  });
  registerJob({
    name:           'interview-day-before-reminder',
    label:          'Interview Day-Before Reminder',
    description:    'Remind the candidate and the interviewer the day before a scheduled interview.',
    color:          '#14b8a6',
    jobType:        'cron',
    cronExpression: '0 8 * * *',   // 8:00 AM daily (morning before)
    handler:        runInterviewDayBeforeReminder,
  });
  registerJob({
    name:           'posting-window-flip',
    label:          'Posting Window Flip',
    description:    'Open roles to external candidates once their 3-day internal-first window closes; notifies the hiring team.',
    color:          '#f97316',
    jobType:        'cron',
    cronExpression: '30 9 * * *',  // 9:30 AM daily
    handler:        runPostingWindowFlip,
  });
  registerJob({
    name:           'weekly-metrics-report',
    label:          'Weekly Metrics Report',
    description:    'Email a weekly hiring-metrics digest (with vs-prior-week deltas) to the configured recipients. Off until enabled in the Metrics tab.',
    color:          '#6366f1',
    jobType:        'cron',
    cronExpression: '0 8 * * 1',   // 8:00 AM every Monday
    handler:        runWeeklyReport,
  });
  registerJob({
    name:           'quarterly-metrics-report',
    label:          'Quarterly Metrics Report',
    description:    'Email a quarterly hiring-metrics summary (with vs-prior-quarter deltas) to the configured recipients on the first day of each quarter. Off until enabled in the Metrics tab.',
    color:          '#7c3aed',
    jobType:        'cron',
    cronExpression: '0 8 1 1,4,7,10 *',  // 8:00 AM on the 1st of Jan/Apr/Jul/Oct
    handler:        runQuarterlyReport,
  });
  registerJob({
    name:           'scorecard-reminder',
    label:          'Scorecard Reminder',
    description:    'Every hour, nudge interviewers who have not yet filled out a scorecard for a completed interview round. Stops once the scorecard is in.',
    color:          '#0d9488',
    jobType:        'cron',
    cronExpression: '0 * * * *',   // top of every hour
    handler:        runScorecardReminder,
  });
}
