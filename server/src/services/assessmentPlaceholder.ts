// ============================================================
// PLACEHOLDER ASSESSMENT
//
// Used while CRITERIA_API_KEY is unset (no live CCAT/EPP integration).
// Instead of Criteria sending an assessment and us fabricating random
// CCAT scores (criteriaCorp.getScores sandbox / simulateUpstreamScores),
// we host a tiny candidate-facing assessment: a tokenized link opens one
// real work-sample question with a Submit button. On submit we store the
// candidate's REAL typed answer, AI-score it, and write a real CCAT-shaped
// score so the existing assessment gate runs on real data.
//
// When CRITERIA_API_KEY is set, isCriteriaConfigured() is true and this
// whole path is bypassed — the app uses the real Criteria flow.
// ============================================================

import { eq, and, asc, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { assessmentTasks } from '../db/schema/assessmentTasks.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { scoreWorkSample } from './ai.js';
import { applyAssessmentDecision } from './assessmentDecision.js';

export function isCriteriaConfigured(): boolean {
  return Boolean(process.env.CRITERIA_API_KEY);
}

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

export interface ResolvedAssessmentTask {
  taskId: string | null;
  title: string;
  brief: string | null;
  instructions: string;         // brief + optional show-your-work
  scoringGuideWork: string | null;
  scoringGuideAi: string | null;
  answerFormat: 'free_text' | 'multi_select';
  options: string[] | null;        // multi_select: choices shown to the candidate
  correctOptions: string[] | null; // multi_select: correct subset (server-only)
  selectCount: number | null;      // multi_select: how many to pick
}

function compose(task: any): ResolvedAssessmentTask {
  const brief = task.brief ?? '';
  const syw = task.showYourWorkInstructions ?? '';
  const instructions = syw ? `${brief}\n\n— Show your work —\n${syw}` : brief;
  return {
    taskId: task.id ?? null,
    title: task.title,
    brief: task.brief ?? null,
    instructions,
    scoringGuideWork: task.scoringGuideWork ?? null,
    scoringGuideAi: task.scoringGuideAi ?? null,
    answerFormat: task.answerFormat === 'multi_select' ? 'multi_select' : 'free_text',
    options: task.options ?? null,
    correctOptions: task.correctOptions ?? null,
    selectCount: task.selectCount ?? null,
  };
}

/**
 * The question shown on the placeholder assessment. The assessment is the early
 * cognitive gate given to everyone, so we prefer a General (department-agnostic)
 * Live task; fall back to the candidate's department work sample, then to any
 * Live task. Returns null only if the task library is empty.
 */
export async function resolveAssessmentTask(
  db: any,
  candidate: { jdId?: string | null; assessmentTaskId?: string | null },
): Promise<ResolvedAssessmentTask | null> {
  // Stick with the task already chosen for this candidate, if any.
  if (candidate.assessmentTaskId) {
    const chosen = await db.query.assessmentTasks.findFirst({ where: eq(assessmentTasks.id, candidate.assessmentTaskId) });
    if (chosen) return compose(chosen);
  }
  // Prefer the earliest-created General (departmentId IS NULL) Live task.
  const general = await db.query.assessmentTasks.findFirst({
    where: and(isNull(assessmentTasks.departmentId), eq(assessmentTasks.status, 'Live'), eq(assessmentTasks.active, true)),
    orderBy: [asc(assessmentTasks.createdAt)],
  });
  if (general) return compose(general);
  // Fall back to the candidate's department work sample.
  const dept = await resolveDeptWorkSample(db, candidate).catch(() => null);
  if (dept?.taskId) {
    const t = await db.query.assessmentTasks.findFirst({ where: eq(assessmentTasks.id, dept.taskId) });
    if (t) return compose(t);
  }
  // Last resort: any Live active task.
  const any = await db.query.assessmentTasks.findFirst({
    where: and(eq(assessmentTasks.status, 'Live'), eq(assessmentTasks.active, true)),
    orderBy: [asc(assessmentTasks.createdAt)],
  });
  return any ? compose(any) : null;
}

/**
 * Ensure a placeholder assessment invite exists for a candidate and return the
 * link to drop into the invite email. No-op (returns no link) when Criteria is
 * configured. Clears any previously-simulated CCAT data so the candidate shows
 * "assessment pending" until they submit a real answer.
 */
export async function ensureAssessmentInvite(
  db: any,
  candidate: { id: string; jdId?: string | null; assessmentToken?: string | null; assessmentTaskId?: string | null },
): Promise<{ placeholder: boolean; link?: string; taskTitle?: string | null }> {
  if (isCriteriaConfigured()) return { placeholder: false };

  const token = candidate.assessmentToken ?? randomUUID();
  const task = await resolveAssessmentTask(db, candidate).catch(() => null);

  await db.update(candidates).set({
    assessmentToken: token,
    assessmentTaskId: task?.taskId ?? candidate.assessmentTaskId ?? null,
    assessmentSentAt: new Date(),
    // Reset to a clean pending state — wipe any simulated CCAT + prior submission.
    assessmentSubmission: null,
    assessmentSubmittedAt: null,
    assessmentCompletedAt: null,
    assessmentNotes: null,
    ccatScore: null,
    ccatPercentile: null,
    ccatVerbal: null,
    ccatMathLogic: null,
    ccatSpatial: null,
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidate.id));

  return { placeholder: true, link: `${appBaseUrl()}/assessment/${token}`, taskTitle: task?.title ?? null };
}

/** Public: the candidate opens the placeholder assessment link. */
export async function getAssessmentByToken(db: any, token: string) {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.assessmentToken, token) });
  if (!candidate) return null;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const task = await resolveAssessmentTask(db, candidate).catch(() => null);
  return {
    firstName: candidate.firstName,
    jobTitle: jd?.jobTitle ?? null,
    taskTitle: task?.title ?? null,
    instructions: task?.instructions ?? 'A member of the hiring team will share the assessment details.',
    alreadySubmitted: !!candidate.assessmentSubmittedAt,
    submittedAt: candidate.assessmentSubmittedAt ?? null,
    answerFormat: task?.answerFormat ?? 'free_text',
    options: task?.options ?? null,
    selectCount: task?.selectCount ?? null,
  };
}

/**
 * Public: the candidate submits their answer. Stores the REAL submission, marks
 * the assessment complete, AI-scores the answer into a real CCAT-shaped score,
 * then runs the normal assessment gate on that real data.
 */
export async function submitAssessment(db: any, token: string, submission: string, selections?: string[], eppAnswer?: 'agree' | 'disagree') {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.assessmentToken, token) });
  if (!candidate) return { ok: false as const, reason: 'not_found' };
  if (candidate.assessmentSubmittedAt) return { ok: true as const }; // idempotent

  const now = new Date();
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const task = await resolveAssessmentTask(db, candidate).catch(() => null);

  // Pick-list (multi_select) questions are auto-graded against their correct
  // answers (no model call). Everything else goes to the rubric scorer.
  let overall: number;
  let gradeSummary = '';
  if (task?.answerFormat === 'multi_select') {
    const correct = task.correctOptions ?? [];
    const need = task.selectCount ?? correct.length ?? 0;
    const denom = Math.max(need, correct.length, 1);
    const sel = Array.isArray(selections) ? selections
      : (submission ? submission.split(',').map((x) => x.trim()).filter(Boolean) : []);
    const cs = new Set(correct);
    const picked = sel.filter((x) => cs.has(x));
    const wrong = sel.filter((x) => !cs.has(x));
    overall = Math.max(0, Math.min(100, Math.round(((picked.length - wrong.length) / denom) * 100)));
    gradeSummary = `Auto-graded pick-list: ${picked.length} of ${correct.length} correct` +
      `${wrong.length ? `, ${wrong.length} incorrect` : ''}. Selected: ${sel.join(', ') || '(none)'}.`;
  } else {
    const scored = await scoreWorkSample({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      jobTitle: jd?.jobTitle ?? null,
      taskTitle: task?.title ?? null,
      brief: task?.brief ?? null,
      scoringGuideWork: task?.scoringGuideWork ?? null,
      scoringGuideAi: task?.scoringGuideAi ?? null,
      submission,
      link: null,
    }).catch(() => null);
    overall = scored?.overallScore ?? 50;
    gradeSummary = scored?.summary ?? '';
  }
  const clampPct = (n: number) => Math.max(1, Math.min(99, Math.round(n)));
  const ccatPercentile = clampPct(overall);
  const ccatScore = Math.max(0, Math.min(50, Math.round((overall / 100) * 50)));
  // Placeholder EPP/values match from the self-report question ("I have good
  // time management" — Agree/Disagree). Stands in for the Criteria EPP profile
  // until the real CCAT/EPP key is configured; drives Role Fit + Values Match.
  const eppMatch = eppAnswer === 'agree' ? 85 : eppAnswer === 'disagree' ? 40 : null;

  const notes = [
    'PLACEHOLDER ASSESSMENT (work-sample based, not a Criteria CCAT).',
    `Derived score: ${overall}/100 → CCAT raw ${ccatScore}/50, percentile ${ccatPercentile}.`,
    eppAnswer ? `EPP self-report ("I have good time management"): ${eppAnswer} → EPP/values match ${eppMatch}%.` : '',
    gradeSummary,
    `[Submitted ${now.toISOString().slice(0, 10)}]`,
  ].filter(Boolean).join('\n');

  await db.update(candidates).set({
    assessmentSubmission: submission,
    assessmentSubmittedAt: now,
    assessmentCompletedAt: now,
    assessmentNotes: notes,
    ccatScore,
    ccatPercentile,
    ccatVerbal: ccatPercentile,
    ccatMathLogic: ccatPercentile,
    ccatSpatial: ccatPercentile,
    ...(eppMatch != null ? { eppValuesMatchScore: eppMatch, companyValuesMatchScore: eppMatch } : {}),
    updatedAt: now,
  }).where(eq(candidates.id, candidate.id));

  // A candidate who self-started the assessment from the application email is
  // still in 'Applied'. Move them into 'Assessment' first so the gate below can
  // evaluate and advance them — otherwise applyAssessmentDecision no-ops (it only
  // acts on candidates already in the Assessment stage) and they'd stay in Applied.
  if (candidate.currentStage === 'Applied') {
    await db.update(candidates)
      .set({ currentStage: 'Assessment', updatedAt: now })
      .where(eq(candidates.id, candidate.id));
    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id,
      fromStage: 'Applied',
      toStage: 'Assessment',
      changedBy: null,
      reason: 'Assessment started from the application email link',
    });
  }

  // Run the normal assessment gate on the real data (self-guards to Assessment stage).
  await applyAssessmentDecision(db, candidate.id).catch((e) => console.error('[assessment-placeholder] decision failed:', e));

  return { ok: true as const };
}
