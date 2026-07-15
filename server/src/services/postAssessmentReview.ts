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
//   4. On pass: advance to Values Review and email the candidate.
//      Tailored interview questions are generated later, once the
//      interview is scheduled (see services/interviewPrep.ts).
//
// No EPP results on file → returns 'skipped' so the caller falls
// back to the legacy Work Sample advance.
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { PIPELINE_STAGES } from '../domain/stages.js';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { computeEppScans, buildRoleFitNotes } from './eppScans.js';
import { screenResumeRequirements } from './ai.js';
import { dispatchStageEmail, emailAssessmentFailedHR } from './email.js';
import { logDecision } from './decisionLog.js';

// Both EPP match and company-values match must be at or above this to advance.
export const MATCH_PASS_THRESHOLD = 70;

export type ReviewResult =
  | { decision: 'passed'; eppMatch: number; valuesMatch: number }
  | { decision: 'held'; eppMatch: number; valuesMatch: number }
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
      const resumeScorePct = req.totalCount ? Math.round((req.metCount / req.totalCount) * 100) : null;
      if (req.totalCount) {
        await db.update(candidates).set({
          resumeReviewScore: resumeScorePct,
          resumeReviewNotes: req.summary,
          updatedAt: new Date(),
        }).where(eq(candidates.id, candidateId));
      }
      if (req.mode === 'ai' && req.missing.length > 0) {
        resumeFailed = true;
        resumeMissing = req.missing;
      }
      // Phase 2 — record the resume screen with its AI provenance.
      await logDecision(db, {
        candidateId,
        decisionType: 'resume_screen',
        outcome: req.mode === 'ai' && req.missing.length > 0 ? 'failed' : 'passed',
        score: resumeScorePct,
        decidedByType: req.mode === 'ai' ? 'ai' : 'deterministic',
        model: req.provenance?.model ?? null,
        requestedModel: req.provenance?.requestedModel ?? null,
        promptId: req.provenance?.promptId ?? null,
        promptVersion: req.provenance?.promptVersion ?? null,
        reason: req.summary,
        inputs: { mode: req.mode, metCount: req.metCount, totalCount: req.totalCount, missing: req.missing },
      });
    } catch (err) {
      console.error('[PostReview] resume screen failed:', err);
    }
  }

  // Persist the computed matches so the panel reflects the auto-review.
  await db.update(candidates).set({
    eppValuesMatchScore: eppMatch,
    companyValuesMatchScore: valuesMatch,
    companyValuesNotes: buildRoleFitNotes(scans),
    screenedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId));

  // 3) Bar check — ADVISORY only. No automatic rejection here anymore. The only
  //    fully-automated reject in the funnel is the CCAT cutoff. Candidates at/above
  //    the 70% bar auto-advance; below it they move into the human review queue
  //    (Values Review), flagged for a person to decide.
  const shortfalls: string[] = [];
  if (resumeFailed) shortfalls.push(resumeMissing.length ? `resume missing required: ${resumeMissing.join('; ')}` : 'resume screening');
  if (eppMatch < MATCH_PASS_THRESHOLD) shortfalls.push(`EPP match ${eppMatch}% (below ${MATCH_PASS_THRESHOLD}%)`);
  if (valuesMatch < MATCH_PASS_THRESHOLD) shortfalls.push(`role-values match ${valuesMatch}% (below ${MATCH_PASS_THRESHOLD}%)`);
  const metBar = shortfalls.length === 0;

  // Always move to Values Review (the human review stage). Never auto-reject.
  await db.update(candidates)
    .set({
      currentStage: 'Values Review',
      screenRecommendation: metBar ? 'advance' : 'review',
      ...(metBar ? {} : {
        companyValuesNotes: `Below auto-advance bar (${shortfalls.join('; ')}). Flagged for human review — not auto-rejected.`,
        // Bump the review-flag count only on a fresh flag (not a re-run while still flagged).
        reviewFlagCount: candidate.screenRecommendation === 'review'
          ? (candidate.reviewFlagCount ?? 0)
          : (candidate.reviewFlagCount ?? 0) + 1,
      }),
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId));

  await logDecision(db, {
    candidateId,
    decisionType: 'post_assessment_review',
    outcome: metBar ? 'passed' : 'pending_review',
    score: Math.min(eppMatch, valuesMatch),
    decidedByType: 'deterministic',
    reason: metBar
      ? `Met the auto-advance bar: EPP ${eppMatch}%, role-values ${valuesMatch}% (threshold ${MATCH_PASS_THRESHOLD}%), resume requirements met — auto-advanced to Values Review.`
      : `Below the auto-advance bar (${shortfalls.join('; ')}). Advanced to Values Review for human review — not auto-rejected.`,
    inputs: { eppMatch, valuesMatch, threshold: MATCH_PASS_THRESHOLD, resumeFailed, resumeMissing, metBar },
  });

  await db.insert(candidateStageHistory).values({
    candidateId, fromStage, toStage: 'Values Review', changedBy: null,
    reason: metBar
      ? `Auto-advanced: met the bar (EPP ${eppMatch}%, role-values ${valuesMatch}%).`
      : `Advanced for human review: below the bar (${shortfalls.join('; ')}) — not auto-rejected.`,
  });

  // Candidate "moving forward" email only when they cleared the bar automatically.
  // Below-bar candidates wait for a human decision in the Review queue.
  if (metBar) {
    void dispatchStageEmail('Values Review', fromStage, {
      firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, jobTitle,
    }).catch((err) => console.error('[PostReview] Values Review email failed:', err));
  }

  console.log(`[PostReview] ${candidate.email} ${metBar ? 'auto-advanced (met bar)' : 'advanced for human review (below bar)'} — EPP ${eppMatch}% / values ${valuesMatch}%`);
  return { decision: metBar ? 'passed' : 'held', eppMatch, valuesMatch };
}

// Seed the candidate's resume text at application time (resume arrives with the
// application). CCAT + EPP are NOT set here — those are assessment results and are
// seeded only when the candidate reaches the Assessment stage (seedAssessmentResults).
const EPP_TRAITS = ['Achievement','Assertiveness','Competitiveness','Conscientiousness','Cooperativeness','Extroversion','Managerial','Motivation','Openness','Patience','Self-Confidence','Stress Tolerance'];

// Deterministic hash so a given candidate always gets the same seeded profile.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h;
}

// A few realistic, DIFFERENTIATED archetypes so the ranking has signal to sort on.
// Each keeps the "RELEVANT QUALIFICATIONS & EXPERIENCE" marker (via qualsBlock) so
// the resume screen treats it as a seeded pass — this never triggers the auto-reject.
const RESUME_ARCHETYPES = [
  {
    summary: 'a senior operator with 13+ years leading go-to-market and P&L for SaaS and edtech businesses, including multi-region expansion across North America, EMEA, and APAC.',
    experience: ['General Manager, International at a K-12 edtech SaaS company — owned a $40M P&L and grew the region 3x in three years.', 'VP of Sales at a B2B SaaS scale-up — built and led a 90-person org across 4 countries.', 'Repeatedly hired, coached, and retained high-performing leadership benches.'],
    skills: 'P&L ownership, international go-to-market, org design, forecasting, cross-cultural leadership, board reporting.',
    education: 'MBA; B.A. in Economics.',
  },
  {
    summary: 'a commercial leader with 9 years in B2B SaaS sales leadership and a strong culture-building track record, with some international exposure but limited K-12 experience.',
    experience: ['Director of Sales at a mid-market SaaS company — led a 55-person team to 120% of quota.', 'Regional Sales Manager — expanded into two new European markets.', 'Known for onboarding and developing first-time managers.'],
    skills: 'sales leadership, pipeline management, enablement, hiring, quota planning, CRM analytics.',
    education: 'B.S. in Business Administration.',
  },
  {
    summary: 'a capable mid-level manager with 5 years of experience in an adjacent industry, an owner mindset, and a clear upward trajectory into broader leadership.',
    experience: ['Regional Manager at a logistics-tech firm — owned a regional quota and a team of 12.', 'Team Lead — improved retention and process efficiency with data-informed decisions.', 'Strong individual results; scope smaller than this senior role.'],
    skills: 'team leadership, operations, analytics, customer success, process improvement.',
    education: 'B.A. in Management.',
  },
  {
    summary: 'a high-potential, earlier-career candidate with 3 years of strong individual results who is stepping up into people leadership for the first time.',
    experience: ['Senior Account Executive — top performer, exceeded quota three years running.', 'Led a small cross-functional pod on a new-market pilot.', 'Limited formal management experience; strong drive and coachability.'],
    skills: 'consultative selling, relationship building, adaptability, communication, initiative.',
    education: 'B.A. in Communications.',
  },
];

export function buildSeededResume(firstName: string, lastName: string, jd: any): string {
  const arch = RESUME_ARCHETYPES[hashString(`${firstName} ${lastName}`) % RESUME_ARCHETYPES.length];
  let qualsBlock = '';
  const req = ((jd as any)?.requiredQualifications ?? '').toString().trim();
  const pref = ((jd as any)?.preferredQualifications ?? '').toString().trim();
  if (req) qualsBlock += '\n\nRELEVANT QUALIFICATIONS & EXPERIENCE\n' + req;
  if (pref) qualsBlock += '\n' + pref;
  return (
    'PROFESSIONAL SUMMARY\n' + firstName + ' ' + lastName + ' is ' + arch.summary + '\n\n' +
    'EXPERIENCE\n' + arch.experience.map((e) => '- ' + e).join('\n') + '\n\n' +
    'SKILLS\n- ' + arch.skills +
    qualsBlock + '\n\n' +
    'EDUCATION\n- ' + arch.education
  );
}

export async function seedCandidateResume(db: any, candidateId: string, candidate: any): Promise<void> {
  if (candidate.resumeText) return;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const resumeText = buildSeededResume(candidate.firstName, candidate.lastName, jd);
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
const BACKFILL_STAGE_ORDER = PIPELINE_STAGES;

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
  // Interviewed (finalist) -> interview score.
  if (target >= idx('Interviewed')) {
    if (candidate.interviewScore == null) patch.interviewScore = rand(65, 31);          // 65-95
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
