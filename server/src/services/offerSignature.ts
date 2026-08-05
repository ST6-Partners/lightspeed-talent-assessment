// ============================================================
// OFFER SIGNATURE — shared completion path
//
// When a candidate agrees & signs their offer (via the in-app tokenized
// signing page /offer-sign/<token>, or via Adobe Sign's own flow → webhook),
// they are auto-advanced to Hired and the role auto-closes once its openings
// are filled (maybeAutoCloseFilledReq honors requisitions.numOpenings — a role
// with 3 openings stays open until 3 candidates are Hired).
//
// Idempotent: a candidate already Hired or already signed is a no-op, so the
// in-app path and the Adobe webhook can both fire without double-processing.
// ============================================================

import { eq } from 'drizzle-orm';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { inboundEmails } from '../db/schema/email.js';
import { emailWelcomeHired, emailOfferAcceptedHR } from './email.js';
import { logDecision } from './decisionLog.js';
import { maybeAutoCloseFilledReq } from './requisitionClose.js';

export interface CompleteOfferSignatureResult {
  ok: boolean;
  alreadyDone: boolean;
  roleClosed: boolean;
}

/**
 * Mark a candidate's offer as signed: advance to Hired, close the role if its
 * openings are now filled, welcome-email + inbox note. Best-effort side effects
 * never block the state transition. `via` records how it was signed.
 */
export async function completeOfferSignature(
  db: any,
  candidate: any,
  opts: { signerName?: string | null; changedByUserId?: string | null; via: 'in_app' | 'adobe_sign' },
): Promise<CompleteOfferSignatureResult> {
  // Idempotency: nothing to do if already hired or already signed.
  if (candidate.currentStage === 'Hired' || candidate.offerSignedAt) {
    return { ok: true, alreadyDone: true, roleClosed: false };
  }

  const fromStage = candidate.currentStage;
  const signedName = (opts.signerName ?? `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`).trim();
  const reason = `Offer signed electronically${signedName ? ` by ${signedName}` : ''} (${opts.via === 'adobe_sign' ? 'Adobe Sign' : 'in-app e-signature'}); auto-advanced to Hired.`;

  await db.update(candidates)
    .set({ currentStage: 'Hired', offerSignedAt: new Date(), updatedAt: new Date() })
    .where(eq(candidates.id, candidate.id));

  await db.insert(candidateStageHistory).values({
    candidateId: candidate.id,
    fromStage,
    toStage: 'Hired',
    changedBy: opts.changedByUserId ?? null,
    reason,
  });

  await logDecision(db, {
    candidateId: candidate.id,
    decisionType: 'manual_stage_change',
    outcome: 'advanced',
    decidedByType: 'human',
    decidedBy: opts.changedByUserId ?? null,
    reason,
    inputs: { via: opts.via, fromStage },
  });

  // Resolve the role title for the notifications (candidates carry jdId, not a title).
  let jobTitle: string | undefined = candidate.jobTitle ?? undefined;
  if (!jobTitle && candidate.jdId) {
    try {
      const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) });
      jobTitle = jd?.jobTitle ?? undefined;
    } catch { /* non-blocking */ }
  }

  // Notifications (best-effort): the candidate is welcomed, and HR is told the
  // offer was ACCEPTED — this is the genuine acceptance point (they just signed).
  try {
    await emailOfferAcceptedHR({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      jobTitle,
    } as any);
    await emailWelcomeHired({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      jobTitle,
    } as any);
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com',
      fromName: 'Lightspeed Hiring',
      toEmail: candidate.email,
      subject: `Welcome to Lightspeed Systems, ${candidate.firstName}!`,
      body: 'Your offer has been signed — welcome to the team! Onboarding will follow.',
      replyTag: 'welcome_hired',
      source: 'simulated',
      raw: { kind: 'offer_signed_hired', candidateId: candidate.id, via: opts.via },
    });
  } catch (err) {
    console.error('[offer-signature] welcome email/inbox record failed:', err);
  }

  // Close the role only when its openings are filled (honors numOpenings).
  let roleClosed = false;
  if (candidate.jdId) {
    try {
      roleClosed = await maybeAutoCloseFilledReq(db, candidate.jdId, opts.changedByUserId ?? null);
    } catch (err) {
      console.error('[offer-signature] auto-close-on-fill failed:', err);
    }
  }

  return { ok: true, alreadyDone: false, roleClosed };
}
