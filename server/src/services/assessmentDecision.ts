// ============================================================
// ASSESSMENT DECISION — automatic pass/fail on assessment score
//
// When a candidate's assessment (CCAT) score lands — via the
// Criteria Corp webhook, the manual "sync scores" action, or a
// direct edit — the app decides automatically:
//
//   CCAT >= 30  → advance to Work Sample stage
//                 + candidate "you're advancing" email
//                 + HR "assessment passed" email
//   CCAT <  30  → move to Rejected
//                 + candidate rejection email
//                 + HR "assessment below threshold" email
//
// All emails go out through the existing SendGrid path (sendEmail
// inside the email service). No manual step.
//
// Idempotent: only acts on candidates still in the Assessment
// stage with a CCAT score on file. Once the stage changes, a
// re-run is a no-op — safe to call from every score-save path.
// ============================================================

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { dispatchStageEmail, emailAssessmentFailedHR } from './email.js';
import { runPostAssessmentReview } from './postAssessmentReview.js';
import { logDecision } from './decisionLog.js';

// Candidates need a CCAT score of at least this to advance.
// Below it, they are automatically rejected. (Flowchart: "Score 30+".)
export const ASSESSMENT_PASS_THRESHOLD = 30;

export type AssessmentDecision =
  | { decision: 'advanced'; score: number }
  | { decision: 'rejected'; score: number }
  | { decision: 'skipped'; reason: string };

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

/**
 * Apply the automatic assessment pass/fail decision for one candidate.
 * Safe to call after any path that saves a CCAT score.
 */
export async function applyAssessmentDecision(
  db: any,
  candidateId: string,
): Promise<AssessmentDecision> {
  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId),
  });

  if (!candidate) return { decision: 'skipped', reason: 'candidate not found' };
  if (candidate.currentStage !== 'Assessment') {
    return { decision: 'skipped', reason: `not in Assessment (currently ${candidate.currentStage})` };
  }
  if (candidate.ccatScore == null) {
    return { decision: 'skipped', reason: 'no CCAT score on file yet' };
  }

  const score: number = candidate.ccatScore;

  // Phase 2 — record the deterministic CCAT gate as its own decision.
  await logDecision(db, {
    candidateId: candidate.id,
    decisionType: 'assessment_gate',
    outcome: score >= ASSESSMENT_PASS_THRESHOLD ? 'passed' : 'rejected',
    score,
    decidedByType: 'deterministic',
    reason: `CCAT score ${score} ${score >= ASSESSMENT_PASS_THRESHOLD ? 'met' : 'below'} the pass threshold of ${ASSESSMENT_PASS_THRESHOLD}.`,
    inputs: { ccatScore: score, threshold: ASSESSMENT_PASS_THRESHOLD },
  });

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = jd?.jobTitle ?? undefined;

  // ── PASS: advance to Work Sample ─────────────────────────
  if (score >= ASSESSMENT_PASS_THRESHOLD) {
    // Deeper auto-review: EPP + company-values (+ prior resume screen) gate.
    // Reject if it fails; on pass it moves to Interview Scheduled and emails
    // the interviewer a summary report + tailored questions. If the candidate
    // has no EPP results, it returns 'skipped' and we fall back to the legacy
    // Work Sample advance below.
    const review = await runPostAssessmentReview(db, candidate.id);
    if (review.decision === 'passed') return { decision: 'advanced', score };
    if (review.decision === 'rejected') return { decision: 'rejected', score };
    // review.decision === 'skipped' -> legacy path below
    // Ensure a work-sample token/link exists so the advancement
    // email carries the candidate's work sample link.
    let token: string | null = candidate.workSampleToken ?? null;
    if (!token) {
      token = randomUUID();
      await db.update(candidates)
        .set({ workSampleToken: token, updatedAt: new Date() })
        .where(eq(candidates.id, candidate.id));
    }
    const workSampleUrl = `${appBaseUrl()}/work-sample/${token}`;

    let workSampleInstructions: string | undefined = jd?.workSampleInstructions ?? undefined;
    const resolved = await resolveDeptWorkSample(db, candidate);
    if (resolved) {
      workSampleInstructions =
        `<strong>${resolved.title}</strong><br/><br/>` + resolved.instructions.replace(/\n/g, '<br/>');
    }

    await db.update(candidates)
      .set({ currentStage: 'Values Review', updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id));

    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id,
      fromStage: 'Assessment',
      toStage: 'Values Review',
      changedBy: null, // automated — no user
      reason: `Auto-advanced: assessment score ${score} met threshold of ${ASSESSMENT_PASS_THRESHOLD}`,
    });

    // Candidate "you're advancing" + HR "assessment passed" (SendGrid)
    await dispatchStageEmail('Values Review', 'Assessment', {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      jobTitle,
      workSampleInstructions,
      workSampleUrl,
    }).catch((err: unknown) => console.error('[AssessmentDecision] advance email failed:', err));

    console.log(`[AssessmentDecision] ${candidate.email} scored ${score} -> advanced to Work Sample`);
    return { decision: 'advanced', score };
  }

  // ── FAIL: reject ─────────────────────────────────────────
  await db.update(candidates)
    .set({
      currentStage: 'Rejected',
      rejectionReason: `Assessment score ${score} below threshold of ${ASSESSMENT_PASS_THRESHOLD}`,
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidate.id));

  await db.insert(candidateStageHistory).values({
    candidateId: candidate.id,
    fromStage: 'Assessment',
    toStage: 'Rejected',
    changedBy: null, // automated — no user
    reason: `Auto-rejected: assessment score ${score} below threshold of ${ASSESSMENT_PASS_THRESHOLD}`,
  });

  // Candidate rejection email (SendGrid)
  await dispatchStageEmail('Rejected', 'Assessment', {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    jobTitle,
  }).catch((err: unknown) => console.error('[AssessmentDecision] rejection email failed:', err));

  // HR "below threshold" notification (SendGrid)
  await emailAssessmentFailedHR({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    jobTitle,
    ccatScore: score,
    threshold: ASSESSMENT_PASS_THRESHOLD,
  }).catch((err: unknown) => console.error('[AssessmentDecision] HR fail email failed:', err));

  console.log(`[AssessmentDecision] ${candidate.email} scored ${score} -> rejected`);
  return { decision: 'rejected', score };
}
