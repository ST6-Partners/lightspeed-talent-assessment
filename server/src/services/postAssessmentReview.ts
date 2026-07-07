// ============================================================
// POST-ASSESSMENT REVIEW — runs automatically when a candidate
// passes the CCAT gate. It:
//   1. Scores EPP match + company-values match from the Criteria
//      EPP results (computeEppScans).
//   2. Runs the resume screen against the job's required quals
//      using the candidate's stored resume text (falls back to a
//      prior screen result if there's no text).
//   3. Gate: reject if resume screening fails a required qual, or
//      EPP match < 70, or company-values match < 70.
//   4. On pass: generate the 30% tailored questions, advance to
//      Work Sample (work sample now sits AFTER this gate), email
//      the candidate their work-sample link, and email the
//      interviewer a summary report + questions via SendGrid.
//
// No EPP results on file → returns 'skipped' so the caller falls
// back to the legacy Work Sample advance.
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { valueReviews, candidateValueScores, companyValues } from '../db/schema/values.js';
import { computeEppScans } from './eppScans.js';
import { generateInterviewQuestions, screenResumeRequirements } from './ai.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { dispatchStageEmail, emailInterviewerReport, emailAssessmentFailedHR } from './email.js';

// Both EPP match and company-values match must be at or above this to advance.
export const MATCH_PASS_THRESHOLD = 70;

export type ReviewResult =
  | { decision: 'passed'; eppMatch: number; valuesMatch: number }
  | { decision: 'rejected'; reason: string; eppMatch: number | null; valuesMatch: number | null }
  | { decision: 'skipped'; reason: string };

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

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

  // 2) Resume screening against the job's required qualifications.
  let resumeFailed = candidate.screenRecommendation === 'rejected';
  let resumeMissing: string[] = [];
  const required = ((jd as any)?.requiredQualifications ?? '') as string;
  if (candidate.resumeText && required) {
    try {
      const req = await screenResumeRequirements(candidate.resumeText, required);
      if (req.totalCount) {
        await db.update(candidates).set({
          resumeReviewScore: Math.round((req.metCount / req.totalCount) * 100),
          resumeReviewNotes: req.summary,
          updatedAt: new Date(),
        }).where(eq(candidates.id, candidateId));
      }
      if (req.mode === 'ai' && req.missing.length > 0) {
        resumeFailed = true;
        resumeMissing = req.missing;
      }
    } catch (err) {
      console.error('[PostReview] resume screen failed:', err);
    }
  }

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
  if (resumeFailed) fails.push(resumeMissing.length ? `resume missing required: ${resumeMissing.join('; ')}` : 'resume screening');
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

  // 4) PASS — generate the tailored questions, advance to Work Sample, notify.
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

  // Ensure a work-sample link exists so the advancement email carries it.
  let token: string | null = candidate.workSampleToken ?? null;
  if (!token) {
    token = randomUUID();
    await db.update(candidates).set({ workSampleToken: token, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  }
  const workSampleUrl = `${appBaseUrl()}/work-sample/${token}`;
  let workSampleInstructions: string | undefined = jd?.workSampleInstructions ?? undefined;
  const resolved = await resolveDeptWorkSample(db, candidate);
  if (resolved) {
    workSampleInstructions = `<strong>${resolved.title}</strong><br/><br/>` + resolved.instructions.replace(/\n/g, '<br/>');
  }

  await db.update(candidates)
    .set({ interviewQuestions: questions, currentStage: 'Work Sample', updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));
  await db.insert(candidateStageHistory).values({
    candidateId, fromStage, toStage: 'Work Sample', changedBy: null,
    reason: `Auto-review passed (EPP ${eppMatch}%, company-values ${valuesMatch}%) — sent to Work Sample`,
  });

  // Candidate: work-sample link + HR "passed" (SendGrid).
  await dispatchStageEmail('Work Sample', fromStage, {
    firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email,
    jobTitle, workSampleInstructions, workSampleUrl,
  }).catch((err: unknown) => console.error('[PostReview] work-sample email failed:', err));

  // Interviewer: summary brief + tailored questions (early heads-up; goes to HR if no interviewer set).
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

  console.log(`[PostReview] ${candidate.email} passed — EPP ${eppMatch}% / values ${valuesMatch}%; sent to Work Sample + interviewer brief`);
  return { decision: 'passed', eppMatch, valuesMatch };
}

// Seed the candidate's resume text at application time (resume arrives with the
// application). CCAT + EPP are NOT set here — those are assessment results and are
// seeded only when the candidate reaches the Assessment stage (seedAssessmentResults).
const EPP_TRAITS = ['Achievement','Assertiveness','Competitiveness','Conscientiousness','Cooperativeness','Extroversion','Managerial','Motivation','Openness','Patience','Self-Confidence','Stress Tolerance'];

export async function seedCandidateResume(db: any, candidateId: string, candidate: any): Promise<void> {
  if (candidate.resumeText) return;
  const resumeText =
    'PROFESSIONAL SUMMARY\n' + candidate.firstName + ' ' + candidate.lastName +
    ' is a results-driven professional with 6+ years of experience delivering high-quality work in fast-paced environments. Strong communicator and collaborator with a track record of ownership and measurable impact.\n\n' +
    'EXPERIENCE\n- Led cross-functional projects from concept to delivery.\n- Improved process efficiency and quality through data-informed decisions.\n- Mentored teammates and contributed to a high-standards culture.\n\n' +
    'SKILLS\n- Communication, problem-solving, collaboration, project management, data analysis, adaptability.\n\n' +
    'EDUCATION\n- B.S. in a relevant field.';
  await db.update(candidates).set({ resumeText, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
}

// Seed the CCAT score + 12 EPP traits when the candidate reaches Assessment
// (simulating Criteria returning results). Only fills what's missing.
export async function seedAssessmentResults(db: any, candidateId: string, candidate: any): Promise<void> {
  if (candidate.ccatScore == null) {
    await db.update(candidates)
      .set({ ccatScore: 22 + Math.floor(Math.random() * 29), updatedAt: new Date() }) // 22-50
      .where(eq(candidates.id, candidateId));
  }
  const existingEpp = await db.query.candidateEppScores.findMany({ where: eq(candidateEppScores.candidateId, candidateId) });
  if (!existingEpp.length) {
    await db.insert(candidateEppScores).values(
      EPP_TRAITS.map((t) => ({ candidateId, trait: t, percentile: 35 + Math.floor(Math.random() * 61) })),
    );
  }
}
