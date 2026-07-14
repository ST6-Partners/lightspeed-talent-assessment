// ============================================================
// INTERVIEW PREP — generates the ~30% candidate-tailored interview
// questions (the candidate's EPP results scanned against the
// company values) and emails them to the interviewer.
//
// Runs ONCE the interview is scheduled — called from both paths
// that reach the "Interview Scheduled" stage: the manual advance
// (candidates.advanceStage) and the Calendly booking webhook
// (services/calendly.ts). Moved here out of the Values Review
// auto-review (services/postAssessmentReview.ts) per product.
//
// Idempotent: if tailored questions already exist on the candidate,
// it is a no-op (so a manual advance followed by a Calendly booking
// doesn't regenerate or double-email).
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { valueReviews, candidateValueScores, companyValues } from '../db/schema/values.js';
import { generateInterviewQuestions } from './ai.js';
import { emailInterviewerQuestions } from './email.js';

export async function prepInterviewQuestions(db: any, candidateId: string): Promise<{ generated: boolean }> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return { generated: false };

  // Idempotent guard: don't regenerate if tailored questions already exist.
  const existing = candidate.interviewQuestions;
  if (Array.isArray(existing) && existing.length) return { generated: false };

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = jd?.jobTitle ?? undefined;

  // EPP per-trait percentiles.
  const eppTraits = await db
    .select({ trait: candidateEppScores.trait, percentile: candidateEppScores.percentile })
    .from(candidateEppScores)
    .where(eq(candidateEppScores.candidateId, candidateId));

  // Company-values per-value scores from the latest values review (if any).
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
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle,
    eppProfile: candidate.eppProfile,
    eppValuesMatchScore: candidate.eppValuesMatchScore,
    eppTraits,
    companyValuesMatchScore: candidate.companyValuesMatchScore,
    companyValuesNotes: candidate.companyValuesNotes,
    valueScores,
    resumeReviewNotes: candidate.resumeReviewNotes,
    resumeReviewScore: candidate.resumeReviewScore,
    workSampleScore: candidate.workSampleScore,
    ccatScore: candidate.ccatScore,
  });

  await db.update(candidates)
    .set({ interviewQuestions: questions, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  await emailInterviewerQuestions({
    interviewerEmail: candidate.interviewerEmail || process.env.HR_EMAIL || 'jade.friedman@lsscorp.net',
    interviewerName: candidate.interviewerName ?? 'Interviewer',
    candidateFirstName: candidate.firstName,
    candidateLastName: candidate.lastName,
    jobTitle: jobTitle ?? 'the role',
    questions,
  }).catch((err) => console.error('[interviewPrep] interviewer email failed:', err));

  return { generated: true };
}
