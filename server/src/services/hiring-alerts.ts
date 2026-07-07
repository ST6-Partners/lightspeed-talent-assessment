// ============================================================
// HIRING ALERTS — timeline / SLA detection (flowchart node X).
//
// Computes two kinds of alert, on the fly (no stored state, no
// migration):
//   1. Stalled candidates — a candidate sitting in a stage longer than
//      that stage's SLA (measured from when they entered the stage via
//      candidate_stage_history, falling back to updatedAt).
//   2. Overdue requisitions — an open/approved req past its overall
//      timeline, or past its target offer/start date with nobody
//      offered or hired, prompting a JD / sourcing / comp reassessment.
//
// Thresholds come from the finalized flowchart's timeline targets
// (assessment wk1, screen/work-sample wk2, phone/interview wk3, offer
// wk4, in-seat ~wk6; senior/non-standard ~6-8 wks). Tunable here.
// ============================================================

import { eq, inArray } from 'drizzle-orm';
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';

// Max days a candidate should sit in ANY stage before it's "stalled" (14).
// Terminal stages (Hired, Rejected) are never flagged. Assessment also has a
// 14-day auto-reject that owns the terminal action.
const STAGE_SLA_DEFAULT_DAYS = 14;
export const STAGE_SLA_DAYS: Record<string, number> = {
  'Applied': STAGE_SLA_DEFAULT_DAYS,
  'Assessment': STAGE_SLA_DEFAULT_DAYS,
  'Work Sample': STAGE_SLA_DEFAULT_DAYS,
  'Values Review': STAGE_SLA_DEFAULT_DAYS,
  'Interview Scheduled': STAGE_SLA_DEFAULT_DAYS,
  'Interviewed': STAGE_SLA_DEFAULT_DAYS,
  'Offered': STAGE_SLA_DEFAULT_DAYS,
};

// Days a requisition may stay open before it's past its overall timeline.
function reqSlaDays(timelineTemplate: string | null | undefined): number {
  switch ((timelineTemplate || 'standard').toLowerCase()) {
    case 'extended':
    case 'senior':
      return 56; // ~8 weeks
    default:
      return 42; // ~6 weeks (standard)
  }
}

const ACTIVE_STAGES = ['Applied', 'Assessment', 'Work Sample', 'Values Review', 'Interview Scheduled', 'Interviewed', 'Offered'];

export interface StalledCandidateAlert {
  candidateId: string;
  name: string;
  jobTitle: string | null;
  stage: string;
  daysInStage: number;
  slaDays: number;
  enteredStageAt: string | null;
}

export interface OverdueReqAlert {
  reqId: string;
  department: string;
  hiringManager: string;
  status: string;
  daysOpen: number;
  slaDays: number;
  reasons: string[];
}

export interface HiringAlerts {
  generatedAt: string;
  stalledCandidates: StalledCandidateAlert[];
  overdueReqs: OverdueReqAlert[];
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// Date a candidate entered their current stage: latest stage-history row
// with toStage == currentStage, falling back to updatedAt.
async function stageEntryDate(db: any, candidateId: string, currentStage: string, updatedAt: Date): Promise<Date> {
  const rows = await db.query.candidateStageHistory.findMany({
    where: eq(candidateStageHistory.candidateId, candidateId),
    orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
  });
  const match = rows.find((r: any) => r.toStage === currentStage);
  return match?.createdAt ?? updatedAt;
}

export async function computeHiringAlerts(db: any): Promise<HiringAlerts> {
  const now = new Date();

  // ── 1. Stalled candidates ──────────────────────────────
  const active = await db.query.candidates.findMany({
    where: inArray(candidates.currentStage, ACTIVE_STAGES as any),
  });

  const stalledCandidates: StalledCandidateAlert[] = [];
  for (const c of active) {
    const sla = STAGE_SLA_DAYS[c.currentStage];
    if (sla == null) continue;
    const entered = await stageEntryDate(db, c.id, c.currentStage, c.updatedAt ?? now);
    const days = daysBetween(entered, now);
    if (days > sla) {
      const jd = c.jdId
        ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, c.jdId) })
        : null;
      stalledCandidates.push({
        candidateId: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        jobTitle: jd?.jobTitle ?? null,
        stage: c.currentStage,
        daysInStage: days,
        slaDays: sla,
        enteredStageAt: entered ? new Date(entered).toISOString() : null,
      });
    }
  }
  stalledCandidates.sort((a, b) => (b.daysInStage - b.slaDays) - (a.daysInStage - a.slaDays));

  // ── 2. Overdue requisitions ────────────────────────────
  const openReqs = await db.query.jobRequisitions.findMany({
    where: inArray(jobRequisitions.status, ['Approved', 'Open'] as any),
  });

  // Which reqs have someone offered/hired (via their JDs)?
  const overdueReqs: OverdueReqAlert[] = [];
  for (const r of openReqs) {
    const created = r.createdAt ? new Date(r.createdAt) : now;
    const daysOpen = daysBetween(created, now);
    const sla = reqSlaDays(r.timelineTemplate);
    const reasons: string[] = [];

    if (daysOpen > sla) reasons.push(`Open ${daysOpen} days (target ~${sla})`);

    // JDs for this req, then whether any candidate is Offered/Hired.
    const jds = await db.query.jobDescriptions.findMany({ where: eq(jobDescriptions.reqId, r.id) });
    const jdIds = jds.map((j: any) => j.id);
    let hasOfferOrHire = false;
    if (jdIds.length) {
      const cands = await db.query.candidates.findMany({ where: inArray(candidates.jdId, jdIds) });
      hasOfferOrHire = cands.some((c: any) => c.currentStage === 'Offered' || c.currentStage === 'Hired');
    }

    const offerBy = r.targetOfferDate ? new Date(r.targetOfferDate) : null;
    if (offerBy && offerBy < now && !hasOfferOrHire) {
      reasons.push(`Past target offer date (${offerBy.toISOString().slice(0, 10)}), no offer out`);
    }
    const startBy = r.targetStartDate ? new Date(r.targetStartDate) : null;
    if (startBy && startBy < now && !hasOfferOrHire) {
      reasons.push(`Past target start date (${startBy.toISOString().slice(0, 10)}), no hire`);
    }

    if (reasons.length) {
      overdueReqs.push({
        reqId: r.id,
        department: r.department,
        hiringManager: r.hiringManager,
        status: r.status,
        daysOpen,
        slaDays: sla,
        reasons,
      });
    }
  }
  overdueReqs.sort((a, b) => b.daysOpen - a.daysOpen);

  return { generatedAt: now.toISOString(), stalledCandidates, overdueReqs };
}

// Render the alert digest as an HTML email body (used by the daily cron).
export function renderAlertDigest(alerts: HiringAlerts): string {
  const cRows = alerts.stalledCandidates.map((s) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.jobTitle ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.stage}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;font-weight:600;">${s.daysInStage}d (SLA ${s.slaDays}d)</td>
    </tr>`).join('');

  const rRows = alerts.overdueReqs.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.department}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.hiringManager}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b45309;font-weight:600;">${r.daysOpen}d open</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.reasons.join('; ')}</td>
    </tr>`).join('');

  return `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1a1a1a;">
    <h2 style="margin:0 0 4px;">Hiring timeline alerts</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 18px;">${new Date(alerts.generatedAt).toLocaleString('en-US')}</p>

    <h3 style="margin:16px 0 6px;font-size:15px;">Candidates sitting too long (${alerts.stalledCandidates.length})</h3>
    ${alerts.stalledCandidates.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Candidate</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Role</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Stage</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Time in stage</th>
      </tr></thead><tbody>${cRows}</tbody></table>` : '<p style="color:#059669;font-size:13px;">None — every active candidate is within stage SLA.</p>'}

    <h3 style="margin:22px 0 6px;font-size:15px;">Requisitions past timeline (${alerts.overdueReqs.length})</h3>
    ${alerts.overdueReqs.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Department</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Hiring manager</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Open</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Why</th>
      </tr></thead><tbody>${rRows}</tbody></table>
      <p style="color:#6b7280;font-size:12px;margin-top:8px;">Reassess JD, sourcing, and comp for the requisitions above.</p>` : '<p style="color:#059669;font-size:13px;">None — every open requisition is within its timeline.</p>'}
  </div>`;
}
