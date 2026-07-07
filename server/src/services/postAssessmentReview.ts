// ============================================================
// POST-ASSESSMENT REVIEW — runs automatically when a candidate
// passes the CCAT gate. It:
//   1. Scores EPP match + company-values match from the Criteria
//      EPP results (computeEppScans — no extra input needed).
//   2. Folds in a prior resume-screen result if one exists.
//   3. Gate: reject if resume screening failed, or EPP match < 70,
//      or company-values match < 70.
//   4. On pass: generate the 30% tailored questions, move to
//      Interview Scheduled, and email the interviewer a summary
//      report + questions via SendGrid.
//
// If the candidate has NO EPP results on file, we cannot run the
// 70/70 gate — the caller falls back to the legacy Work Sample
// advance. Idempotent enough for the single call from the CCAT
// pass path.
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { valueReviews, candidateValueScores, companyValues } from '../db/schema/values.js';
import { computeEppScans } from './eppScans.js';
import { generateInterviewQuestions } from './ai.js';
import { dispatchStageEmail, emailInterviewerReport, emailAssessmentFailedHR } from './email.js';

// Both EPP match and company-values match must be at or above this to advance.
export const MATCH_PASS_THRESHOLD = 70;

export type ReviewResult =
  | { decision: 'passed'; eppMatch: number; valuesMatch: number }
  | { decision: 'rejected'; reason: string; eppMatch: number | null; valuesMatch: number | null }
  | { decision: 'skipped'; reason: string };

export async function runPostAssessmentReview(db: any, candidateId: string): Promise<ReviewResult> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return { decision: 'skipped', reason: 'candidate not found' };

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = jd?.jobTitle ?? undefined;
  const fromStage: string = candidate.currentStage;

  // 1) EPP + company-values scoring from the Criteria EPP results.
  const scans = await computeEppScans(db, candidateId);
  if (!scans.hasEpp) {
    return { decision: 'skipped', reason: 'no EPP results on file — cannot run the 70/70 gate' };
  }
  const eppMatch = scans.eppMatch ?? 0;
  const valuesMatch = scans.companyValuesMatch ?? 0;

  // 2) Resume screening: reuse a prior screen result if one exists (no resume
  //    text is stored to run a fresh screen automatically).
  const resumeRejected = candidate.screenRecommendation === 'rejected';

  // Persist the computed matches so the panel reflects the auto-review.
  await db.update(candidates).set({
    eppValuesMatchScore: eppMatch,
    companyValuesMatchScore: valuesMatch,
    companyValuesNotes: `Auto-review after assessment: EPP match ${eppMatch}/100, company-values match ${valuesMatch}/100 across ${scans.scoredValues}/${scans.totalValues} values.`,
    screenedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId));

  // 3) Gate.
  const fails: string[] = [];
  if (resumeRejected) fails.push('resume screening');
  if (eppMatch < MATCH_PASS_THRESHOLD) fails.push(`EPP match ${eppMatch}% (below ${MATCH_PASS_THRESHOLD}%)`);
  if (valuesMatch < MATCH_PASS_THRESHOLD) fails.push(`company-values match ${valuesMatch}% (below ${MATCH_PASS_THRESHOLD}%)`);

  if (fails.length) {
    const reason = `Auto-review after assessment did not meet: ${fails.join('; ')}.`;
    await db.update(candidates)
      .set({ currentStage: 'Rejected', rejectionReason: reason, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    await db.insert(candidateStageHistory).values({
      candidateId, fromStage, toStage: 'Rejected', changedBy: null, reason,
    });
    await dispatchStageEmail('Rejected', fromStage, {
      firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
    }).catch((err: unknown) => console.error('[PostReview] rejection email failed:', err));
    await emailAssessmentFailedHR({
      firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
      ccatScore: candidate.ccatScore ?? 0, threshold: MATCH_PASS_THRESHOLD,
    }).catch(() => {});
    console.log(`[PostReview] ${candidate.email} rejected — ${reason}`);
    return { decision: 'rejected', reason, eppMatch, valuesMatch };
  }

  // 4) PASS — gather data, generate the 30% tailored questions, send interviewer report.
  const eppTraits = await db
    .select({ trait: candidateEppScores.trait, percentile: candidateEppScores.percentile })
    .from(candidateEppScores)
    .where(eq(candidateEppScores.candidateId, candidateId));
  let valueScores: Array<{ value: string; score: number }> = [];
  const latestReview = (await db
    .select({ id: valueReviews.id })
    .from(valueReviews)
    .where(eq(valueReviews.candidateId, candidateId))
    .orderBy(desc(valueReviews.reviewedAt))
    .limit(1))[0];
  if (latestReview) {
    valueScores = await db
      .select({ value: companyValues.name, score: candidateValueScores.score })
      .from(candidateValueScores)
      .innerJoin(companyValues, eq(candidateValueScores.valueId, companyValues.id))
      .where(eq(candidateValueScores.reviewId, latestReview.id));
  }

  const questions = await generateInterviewQuestions({
    firstName: candidate.firstName, lastName: candidate.lastName, jobTitle,
    eppProfile: candidate.eppProfile, eppValuesMatchScore: eppMatch, eppTraits,
    companyValuesMatchScore: valuesMatch, companyValuesNotes: candidate.companyValuesNotes,
    valueScores, resumeReviewNotes: candidate.resumeReviewNotes, resumeReviewScore: candidate.resumeReviewScore,
    workSampleScore: candidate.workSampleScore, ccatScore: candidate.ccatScore,
  });

  await db.update(candidates)
    .set({ interviewQuestions: questions, currentStage: 'Interview Scheduled', updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));
  await db.insert(candidateStageHistory).values({
    candidateId, fromStage, toStage: 'Interview Scheduled', changedBy: null,
    reason: `Auto-review passed: EPP match ${eppMatch}%, company-values match ${valuesMatch}%`,
  });

  const interviewerEmail = candidate.interviewerEmail || process.env.HR_EMAIL || 'jade.friedman@lsscorp.net';
  await emailInterviewerReport({
    interviewerEmail,
    interviewerName: candidate.interviewerName ?? 'Interviewer',
    candidateFirstName: candidate.firstName,
    candidateLastName: candidate.lastName,
    jobTitle: jobTitle ?? 'the role',
    ccatScore: candidate.ccatScore,
    eppMatch, valuesMatch,
    resumeReviewScore: candidate.resumeReviewScore,
    workSampleScore: candidate.workSampleScore,
    eppTraits, valueScores, questions,
  }).catch((err: unknown) => console.error('[PostReview] interviewer report email failed:', err));

  console.log(`[PostReview] ${candidate.email} passed — EPP ${eppMatch}% / values ${valuesMatch}%; interviewer report sent`);
  return { decision: 'passed', eppMatch, valuesMatch };
}
