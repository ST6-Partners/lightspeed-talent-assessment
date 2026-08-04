// ============================================================
// WORK SAMPLE ENTRY (shared stage side effects)
//
// Runs the side effects of a candidate ENTERING the Work Sample stage — the
// same work the manual advance paths do (resolveReview + advanceStage in the
// candidates router), factored out so the automatic post-interview router
// (interviewRounds.maybeAdvanceOnAllRoundsComplete) can reuse it verbatim
// instead of a third hand-copied block.
//
//   • live_walkthrough role -> ensure the walkthrough interview round + its
//     "pick a time" invite; NO take-home email.
//   • take-home role (default) -> mint the candidate's /work-sample/:token
//     link, compose the department task instructions, email the invite.
//
// Does NOT change candidate.currentStage — the caller owns the stage move and
// its history / decision-log rows. Never throws: mail/round failures are
// logged and swallowed so a side-effect miss can't roll back the stage move.
// ============================================================

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { ensureWalkthroughRound } from './workSampleWalkthrough.js';
import { dispatchStageEmail } from './email.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

/**
 * Fire the Work Sample entry side effects for a candidate that has just been
 * moved into the Work Sample stage.
 *
 * @param dbIn      drizzle db handle (defaults to the app db)
 * @param candidateId candidate to set up
 * @param fromStage the stage they advanced from (for the invite email copy)
 */
export async function enterWorkSampleStage(
  dbIn: any,
  candidateId: string,
  fromStage: string | null = null,
): Promise<void> {
  const db = dbIn ?? defaultDb;

  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle = jd?.jobTitle ?? undefined;

  const resolved = await resolveDeptWorkSample(db, candidate).catch((err: any) => {
    console.error('[workSampleEntry] resolve dept work sample failed:', err);
    return null;
  });

  // Live walkthrough: book a live round + its scheduling invite, no homework email.
  if (resolved?.deliveryMode === 'live_walkthrough') {
    await ensureWalkthroughRound(db, candidateId).catch((err: any) =>
      console.error('[workSampleEntry] ensure walkthrough round failed:', err));
    return;
  }

  // Take-home (default): mint the tokenized submission link + email the invite.
  const token = (candidate as any).workSampleToken ?? randomUUID();
  if (!(candidate as any).workSampleToken) {
    await db.update(candidates)
      .set({ workSampleToken: token, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  }
  const workSampleUrl = `${appBaseUrl()}/work-sample/${token}`;
  const workSampleInstructions = resolved
    ? `<strong>${resolved.title}</strong><br/><br/>` + resolved.instructions.replace(/\n/g, '<br/>')
    : (jd?.workSampleInstructions ?? undefined);

  await dispatchStageEmail('Work Sample', fromStage, {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    jobTitle,
    workSampleInstructions,
    workSampleUrl,
  }).catch((err: any) => console.warn('[workSampleEntry] invite email failed (non-blocking):', err));
}
