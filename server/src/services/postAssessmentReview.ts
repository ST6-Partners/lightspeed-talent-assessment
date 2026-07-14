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
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { valueReviews, candidateValueScores, companyValues } from '../db/schema/values.js';
import { computeEppScans } from './eppScans.js';
import { generateInterviewQuestions, screenResumeRequirements } from './ai.js';
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

  // 2) Resume screening against the job's required qualifications.
  let resumeFailed = candidate.screenRecommendation === 'rejected';
  let resumeMissing: string[] = [];
  const required = ((jd as any)?.requiredQualifications ?? '') as string;
  // Auto-generated test resumes are seeded with the role's own qualifications and
  // always pass the screen (deterministic for testing). Real uploaded resumes are
  // screened normally by the AI below.
  const isSeededResume = typeof candidate.resumeText === 'string'
    && candidate.resumeText.includes('RELEVANT QUALIFICATIONS & EXPERIENCE');
  if (isSeededResume) {
    resumeFailed = false;
    await db.update(candidates).set({
      resumeReviewScore: 100,
      resumeReviewNotes: 'Auto-generated test resume — meets all required qualifications.',
      updatedAt: new Date(),
    }).where(eq(candidates.id, candidateId));
  } else if (candidate.resumeText && required) {
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
    // Emails in the background so the caller (stage advance) returns immediately.
    void (async () => {
      try {
        await dispatchStageEmail('Rejected', fromStage, {
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
        });
        await emailAssessmentFailedHR({
          firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
          ccatScore: candidate.ccatScore ?? 0, threshold: MATCH_PASS_THRESHOLD,
        });
      } catch (err) { console.error('[PostReview] rejection emails failed:', err); }
    })();
    console.log(`[PostReview] ${candidate.email} rejected — ${reason}`);
    return { decision: 'rejected', reason, eppMatch, valuesMatch };
  }

  // 4) PASS — move to Values Review immediately (fast). The candidate cleared the
  // EPP + company-values + resume gate; the Work Sample comes AFTER Values Review
  // (its link is sent when they're advanced into Work Sample). Tailored questions
  // (a Claude call) + emails run in the background so the advance returns instantly.
  await db.update(candidates)
    .set({ currentStage: 'Values Review', updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));
  await db.insert(candidateStageHistory).values({
    candidateId, fromStage, toStage: 'Values Review', changedBy: null,
    reason: `Auto-review passed (EPP ${eppMatch}%, company-values ${valuesMatch}%) — sent to Values Review`,
  });

  void (async () => {
    try {
      await dispatchStageEmail('Values Review', fromStage, {
        firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
      });

      const eppTraits = await db
        .select({ trait: candidateEppScores.trait, percentile: candidateEppScores.percentile })
        .from(candidateEppScores).where(eq(candidateEppScores.candidateId, candidateId));
      let valueScores: Array<{ value: string; score: number }> = [];
      const latestReview = (await db
        .select({ id: valueReviews.id }).from(valueReviews)
        .where(eq(valueReviews.candidateId, candidateId))
        .orderBy(desc(valueReviews.reviewedAt)).limit(1))[0];
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
      await db.update(candidates).set({ interviewQuestions: questions, updatedAt: new Date() }).where(eq(candidates.id, candidateId));

      const interviewerEmail = candidate.interviewerEmail || process.env.HR_EMAIL || 'jade.friedman@lsscorp.net';
      await emailInterviewerReport({
        interviewerEmail, interviewerName: candidate.interviewerName ?? 'Interviewer',
        candidateFirstName: candidate.firstName, candidateLastName: candidate.lastName, jobTitle: jobTitle ?? 'the role',
        ccatScore: candidate.ccatScore, eppMatch, valuesMatch,
        resumeReviewScore: candidate.resumeReviewScore, workSampleScore: candidate.workSampleScore,
        eppTraits, valueScores, questions,
      });
    } catch (err) { console.error('[PostReview] background pass tasks failed:', err); }
  })();

  console.log(`[PostReview] ${candidate.email} passed — EPP ${eppMatch}% / values ${valuesMatch}%; Work Sample set, brief queued`);
  return { decision: 'passed', eppMatch, valuesMatch };
}

// Seed the candidate's resume text at application time (resume arrives with the
// application). CCAT + EPP are NOT set here — those are assessment results and are
// seeded only when the candidate reaches the Assessment stage (seedAssessmentResults).
const EPP_TRAITS = ['Achievement','Assertiveness','Competitiveness','Conscientiousness','Cooperativeness','Extroversion','Managerial','Motivation','Openness','Patience','Self-Confidence','Stress Tolerance'];

export async function seedCandidateResume(db: any, candidateId: string, candidate: any): Promise<void> {
  if (candidate.resumeText) return;

  // If the candidate is tied to a role, weave that role's required (and preferred)
  // qualifications into the seeded resume so the resume screen finds them met.
  // Otherwise a generic resume fails every role's required-quals check and the
  // candidate gets auto-rejected before CCAT/EPP/values ever matter.
  let qualsBlock = '';
  if (candidate.jdId) {
    const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) });
    const req = ((jd as any)?.requiredQualifications ?? '').toString().trim();
    const pref = ((jd as any)?.preferredQualifications ?? '').toString().trim();
    if (req) qualsBlock += '\n\nRELEVANT QUALIFICATIONS & EXPERIENCE\n' + req;
    if (pref) qualsBlock += '\n' + pref;
  }

  const resumeText =
    'PROFESSIONAL SUMMARY\n' + candidate.firstName + ' ' + candidate.lastName +
    ' is a results-driven professional with 6+ years of experience delivering high-quality work in fast-paced environments. Strong communicator and collaborator with a track record of ownership and measurable impact.\n\n' +
    'EXPERIENCE\n- Led cross-functional projects from concept to delivery.\n- Improved process efficiency and quality through data-informed decisions.\n- Mentored teammates and contributed to a high-standards culture.\n\n' +
    'SKILLS\n- Communication, problem-solving, collaboration, project management, data analysis, adaptability.' +
    qualsBlock + '\n\n' +
    'EDUCATION\n- B.S. in a relevant field.';
  await db.update(candidates).set({ resumeText, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
}

// Seed the CCAT score + 12 EPP traits when the candidate reaches Assessment
// (simulating Criteria returning results). Only fills what's missing.
export async function seedAssessmentResults(db: any, candidateId: string, candidate: any): Promise<void> {
  if (candidate.ccatScore == null) {
    // 22-50 out of 50 — lands above OR below the pass threshold (30), leaning pass
    // (~70%) so testing isn't dominated by CCAT rejects but some still fail.
    await db.update(candidates)
      .set({ ccatScore: 22 + Math.floor(Math.random() * 29), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  }
  const existingEpp = await db.query.candidateEppScores.findMany({ where: eq(candidateEppScores.candidateId, candidateId) });
  if (!existingEpp.length) {
    // Random per-candidate baseline (62-92) with tight jitter so the 12-trait
    // AVERAGE (EPP match) and the value-mapped averages (values match) both land
    // above OR below the 70% threshold together — leaning pass (~70%) so candidates
    // actually get through, while some still fail. Three independent gates (CCAT +
    // EPP + values) otherwise stack the odds heavily toward rejection.
    const base = 62 + Math.floor(Math.random() * 31); // 62-92
    const clamp = (n: number) => Math.max(5, Math.min(99, n));
    await db.insert(candidateEppScores).values(
      EPP_TRAITS.map((t) => ({ candidateId, trait: t, percentile: clamp(base + (Math.floor(Math.random() * 25) - 12)) })), // base +/- 12
    );
  }
}


// ============================================================
// TEST-DATA BACKFILL
// Fills simulated upstream scores (resume review, work sample) for candidates who
// are already at/past those stages but are missing them — e.g. test candidates
// advanced by hand. Idempotent: only ever fills nulls, never overwrites. Same
// spirit as seedAssessmentResults (simulated demo data, not real scoring).
// ============================================================
const BACKFILL_STAGE_ORDER = [
  'Applied', 'Assessment', 'Values Review', 'Work Sample',
  'Interview Scheduled', 'Interviewed', 'Offered', 'Hired',
];

// The old one-line note that earlier builds wrote for seeded candidates.
const LEGACY_WS_STUB = 'Simulated work-sample score (test data).';

// Full simulated work-sample breakdown for seeded/hand-advanced candidates that
// have no real submission. Mirrors the layout of a real AI score (formatNotes in
// workSampleScoring.ts) so the scoring-breakdown dropdown always renders the full
// per-criterion view. Every line is clearly marked as simulated test data.
function simulatedWorkSampleBreakdown(overall: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const wq = clamp(overall + 2);
  const ai = clamp(overall - 4);
  const pass = overall >= MATCH_PASS_THRESHOLD ? 'PASS' : 'FAIL';
  const lines: string[] = [];
  lines.push('SIMULATED SAMPLE - test data, not a real evaluation of this candidate.');
  lines.push(`AI work-sample score: ${overall}/100 (work quality ${wq}, AI skill ${ai}) · illustrative sample breakdown`);
  lines.push(`RESULT: ${pass} (pass mark ${MATCH_PASS_THRESHOLD})`);
  lines.push('', 'This candidate has no real work-sample submission on file. The breakdown below shows the full per-criterion view a real AI score produces. Send a work sample and re-score for a grounded, submission-specific result.');
  lines.push('', 'Breakdown:');
  lines.push(`- [work] Understood the task and scoped the problem - ${clamp(overall + 4)}/100: Sample reason. A real score cites the submission.`);
  lines.push(`- [work] Quality and correctness of the work - ${overall}/100: Sample reason. A real score cites the work delivered.`);
  lines.push(`- [work] Communication and structure - ${clamp(overall + 1)}/100: Sample reason. A real score cites clarity and organization.`);
  lines.push(`- [AI use] Prompt quality and iteration - ${clamp(overall - 3)}/100: Sample reason. A real score cites the prompts shown.`);
  lines.push(`- [AI use] Judgment on AI output - ${clamp(overall - 6)}/100: Sample reason. A real score cites where the candidate corrected the model.`);
  lines.push('', 'Strengths:', '- Sample strength. A real score is grounded in the submission.');
  lines.push('', 'Concerns:', '- SIMULATED sample, not a real candidate evaluation.');
  lines.push('', `[Simulated ${new Date().toISOString().slice(0, 10)} - test data]`);
  return lines.join('\n');
}

export function simulateUpstreamScores(candidate: any, toStage: string): Record<string, any> {
  const idx = (st: string) => BACKFILL_STAGE_ORDER.indexOf(st);
  const target = idx(toStage);
  const rand = (min: number, span: number) => min + Math.floor(Math.random() * span);
  const patch: Record<string, any> = {};

  // Assessment stage -> CCAT (pass-leaning >= 30 for a candidate that advanced).
  if (target >= idx('Assessment') && candidate.ccatScore == null) {
    patch.ccatScore = rand(32, 19); // 32-50
  }
  // Screen (Values Review) -> EPP match, company-values match, resume review.
  if (target >= idx('Values Review')) {
    if (candidate.eppValuesMatchScore == null) patch.eppValuesMatchScore = rand(70, 23);        // 70-92
    if (candidate.companyValuesMatchScore == null) patch.companyValuesMatchScore = rand(70, 23); // 70-92
    if (candidate.resumeReviewScore == null) {
      patch.resumeReviewScore = rand(72, 27); // 72-98
      if (candidate.screenRecommendation == null) patch.screenRecommendation = 'advance';
    }
  }
  // Work Sample stage -> auto-scored work sample.
  if (target >= idx('Work Sample') && candidate.workSampleScore == null) {
    const wsScore = rand(62, 34); // 62-95
    patch.workSampleScore = wsScore;
    // Write a FULL breakdown (same layout as a real AI score) so the work-sample
    // dropdown always shows the complete per-criterion view, clearly marked as
    // simulated sample data. Replaces the old one-line stub.
    if (candidate.workSampleNotes == null) patch.workSampleNotes = simulatedWorkSampleBreakdown(wsScore);
  }
  // Interviewed (finalist) -> interview score + reference confidence.
  if (target >= idx('Interviewed')) {
    if (candidate.interviewScore == null) patch.interviewScore = rand(65, 31);          // 65-95
    if (candidate.referenceCheckScore == null) patch.referenceCheckScore = rand(70, 26); // 70-95
  }
  return patch;
}

export async function backfillTestScores(db: any): Promise<number> {
  const rows = await db.query.candidates.findMany({});
  let filled = 0;
  for (const c of rows as any[]) {
    if (c.currentStage === 'Rejected') continue;
    const patch = simulateUpstreamScores(c, c.currentStage);
    // One-time upgrade: candidates seeded by earlier builds carry the old one-line
    // stub. Replace it with the full simulated breakdown so the scoring dropdown
    // shows the complete per-criterion view for existing data too.
    if (c.workSampleNotes === LEGACY_WS_STUB && c.workSampleScore != null) {
      patch.workSampleNotes = simulatedWorkSampleBreakdown(c.workSampleScore);
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      await db.update(candidates).set(patch).where(eq(candidates.id, c.id));
      filled++;
    }
  }
  if (filled) console.log(`  [test-data] backfilled simulated upstream scores for ${filled} candidate(s).`);
  return filled;
}
