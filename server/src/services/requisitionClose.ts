// ============================================================
// REQUISITION CLOSE / FILL — candidate disposition (shared)
//
// When a requisition is closed or filled, the candidates still in flight need a
// real ending instead of sitting active forever. This module centralizes that
// so BOTH the manual close (requisitions.update) and the automatic
// close-on-fill (candidates.advanceStage -> Hired) behave identically:
//
//   • Closed / filled  -> every still-active candidate is moved to the terminal
//                         'Not Selected' disposition (role ended — explicitly
//                         NOT an individual rejection) + a courtesy email.
//   • On Hold          -> candidates stay active; courtesy "on hold" note only.
//
// The distinct 'Not Selected' stage (vs. 'Rejected') keeps rejection analytics
// and adverse-impact reporting clean: nobody is recorded as rejected on their
// merits just because a role closed.
// ============================================================

import { eq, inArray } from 'drizzle-orm';
import { TERMINAL_STAGES } from '../domain/stages.js';
import {
  jobRequisitions,
  jobDescriptions,
  candidates,
  candidateStageHistory,
} from '../db/schema/hiring.js';
import { inboundEmails } from '../db/schema/email.js';
import { emailReqStatusToCandidate } from './email.js';
import { logDecision } from './decisionLog.js';

// Stages that are already finished — never re-touched by a close/fill.

function emailFromAddr(): string {
  return process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com';
}

export interface DispositionResult {
  notified: number;   // courtesy emails sent
  disposed: number;   // candidates moved to 'Not Selected'
}

/**
 * Apply the candidate-side effects of a requisition changing to Closed or On Hold.
 * Idempotent-ish: candidates already in a terminal stage are skipped.
 */
export async function dispositionCandidatesForReqStatus(
  db: any,
  reqId: string,
  status: 'Closed' | 'On Hold',
  changedByUserId: string | null,
): Promise<DispositionResult> {
  const onHold = status === 'On Hold';

  const jds = await db.query.jobDescriptions.findMany({ where: eq(jobDescriptions.reqId, reqId) });
  const jdIds = jds.map((j: any) => j.id);
  if (!jdIds.length) return { notified: 0, disposed: 0 };

  const cands = await db.query.candidates.findMany({ where: inArray(candidates.jdId, jdIds) });
  const active = cands.filter((c: any) => !TERMINAL_STAGES.includes(c.currentStage));

  let notified = 0;
  let disposed = 0;

  for (const c of active) {
    const jd = jds.find((j: any) => j.id === c.jdId);
    const jobTitle = jd?.jobTitle ?? undefined;

    // Closed/filled → move to a real terminal disposition (NOT 'Rejected').
    if (!onHold) {
      const reason =
        'Requisition closed/filled — candidacy ended because the role is no longer open (not an individual rejection).';
      await db.update(candidates)
        .set({ currentStage: 'Not Selected', rejectionReason: reason, updatedAt: new Date() })
        .where(eq(candidates.id, c.id));
      await db.insert(candidateStageHistory).values({
        candidateId: c.id,
        fromStage: c.currentStage,
        toStage: 'Not Selected',
        changedBy: changedByUserId,
        reason,
      });
      await logDecision(db, {
        candidateId: c.id,
        decisionType: 'requisition_closed',
        outcome: 'not_selected',
        decidedByType: 'deterministic',
        decidedBy: changedByUserId,
        reason,
        inputs: { reqId, fromStage: c.currentStage },
      });
      disposed++;
    }

    // Courtesy email either way (preserves prior behavior).
    try {
      await emailReqStatusToCandidate({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        jobTitle,
        onHold,
      });
      await db.insert(inboundEmails).values({
        fromEmail: emailFromAddr(),
        fromName: 'Lightspeed Hiring',
        toEmail: c.email,
        subject: onHold
          ? `Update on the ${jobTitle ?? 'role'} at Lightspeed Systems`
          : `Update on your application — ${jobTitle ?? 'Lightspeed Systems'}`,
        body: onHold
          ? 'The role you are being considered for has been placed on hold; your application remains active.'
          : 'This position has been closed; we will not be moving forward with hiring for it at this time.',
        replyTag: onHold ? 'req_on_hold' : 'req_closed',
        source: 'simulated',
        raw: { kind: onHold ? 'req_on_hold' : 'req_closed', reqId, candidateId: c.id },
      });
      notified++;
    } catch (err) {
      console.error('[requisition] candidate status-notify failed:', err);
    }
  }

  return { notified, disposed };
}

/**
 * Called after a candidate reaches 'Hired'. If that hire fills the requisition
 * (hired count >= openings), auto-close the req and dispose the remaining active
 * candidates — so the tail always gets an ending + email instead of waiting on
 * someone remembering to close the role manually. Returns true if it closed.
 */
export async function maybeAutoCloseFilledReq(
  db: any,
  jdId: string,
  changedByUserId: string | null,
): Promise<boolean> {
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) });
  if (!jd?.reqId) return false;

  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) });
  if (!req || req.status === 'Closed') return false;

  // Count hires across every JD on this requisition.
  const jds = await db.query.jobDescriptions.findMany({ where: eq(jobDescriptions.reqId, req.id) });
  const jdIds = jds.map((j: any) => j.id);
  const cands = await db.query.candidates.findMany({ where: inArray(candidates.jdId, jdIds) });
  const hired = cands.filter((c: any) => c.currentStage === 'Hired').length;
  const openings = req.numOpenings ?? 1;
  if (hired < openings) return false;

  // Openings filled → close the requisition and dispose the rest.
  await db.update(jobRequisitions)
    .set({ status: 'Closed', updatedAt: new Date() })
    .where(eq(jobRequisitions.id, req.id));
  await dispositionCandidatesForReqStatus(db, req.id, 'Closed', changedByUserId);
  return true;
}
