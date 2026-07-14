// ============================================================
// WORK-SAMPLE SCORING ORCHESTRATION
//
// Loads a candidate + the resolved work-sample task (with its
// current rubric), runs the rubric-driven scorer, writes the
// overall score + a per-criterion rationale, and applies the
// pass mark. When auto-reject is enabled (app_settings), a
// failing candidate in an early stage is moved to Rejected.
//
// Used by: workSample.submit (auto, fire-and-forget) and
// workSample.rescore (manual re-run after a rubric changes).
// ============================================================
import { eq } from 'drizzle-orm';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { scoreWorkSample, type WorkSampleScoreResult } from './ai.js';
import { getWorkSampleScoringConfig } from './workSampleConfig.js';
import { logDecision } from './decisionLog.js';

// Stages early enough that an auto-reject is appropriate (never touch someone
// already advanced to interviews or beyond, or already Hired/Rejected).
const AUTO_REJECT_STAGES = ['Applied', 'Assessment', 'Work Sample'];

function formatNotes(
  r: WorkSampleScoreResult,
  meta: { pass: boolean; threshold: number; autoRejected: boolean },
): string {
  const lines: string[] = [];
  lines.push(
    `AI work-sample score: ${r.overallScore}/100 (work quality ${r.workQualityScore}, AI skill ${r.aiSkillScore})` +
    `${r.rubricUsed ? '' : ' — no rubric configured; scored from brief'} · ` +
    `${r.mode === 'placeholder' ? 'sandbox draft' : 'AI draft — verify before relying on it'}`,
  );
  lines.push(
    `RESULT: ${meta.pass ? 'PASS' : 'FAIL'} (pass mark ${meta.threshold})` +
    `${meta.pass ? '' : ' — flagged for human review (not auto-rejected)'}`,
  );
  if (r.summary) lines.push('', r.summary);
  if (r.criteria && r.criteria.length) {
    lines.push('', 'Breakdown:');
    for (const c of r.criteria) {
      lines.push(`- [${c.dimension === 'ai' ? 'AI use' : 'work'}] ${c.criterion} — ${c.score}/100: ${c.reason}`);
    }
  }
  if (r.strengths.length) lines.push('', 'Strengths:', ...r.strengths.map((x) => `- ${x}`));
  if (r.concerns.length) lines.push('', 'Concerns:', ...r.concerns.map((x) => `- ${x}`));
  lines.push('', `[Scored ${new Date().toISOString().slice(0, 10)}]`);
  return lines.join('\n');
}

export async function scoreAndStoreWorkSample(db: any, candidateId: string): Promise<WorkSampleScoreResult | null> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate || !candidate.workSampleSubmission) return null;

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const resolved = await resolveDeptWorkSample(db, candidate);

  const result = await scoreWorkSample({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: jd?.jobTitle ?? null,
    taskTitle: resolved?.title ?? null,
    brief: resolved?.brief ?? jd?.workSampleInstructions ?? null,
    scoringGuideWork: resolved?.scoringGuideWork ?? null,
    scoringGuideAi: resolved?.scoringGuideAi ?? null,
    submission: candidate.workSampleSubmission,
    link: candidate.workSampleLink ?? null,
  });

  const cfg = await getWorkSampleScoringConfig(db);
  const pass = result.overallScore >= cfg.passThreshold;
  // Auto-reject removed: below-mark work samples are flagged for human review, never auto-rejected.
  const autoRejected = false;
  const flaggedForReview = !pass && AUTO_REJECT_STAGES.includes(candidate.currentStage);
  void cfg.autoRejectEnabled;

  // Phase 2 — record the work-sample scoring decision with AI provenance.
  await logDecision(db, {
    candidateId,
    decisionType: 'work_sample',
    outcome: pass ? 'passed' : (flaggedForReview ? 'pending_review' : 'scored'),
    score: result.overallScore,
    decidedByType: result.mode === 'ai' ? 'ai' : 'deterministic',
    model: result.provenance?.model ?? null,
    requestedModel: result.provenance?.requestedModel ?? null,
    promptId: result.provenance?.promptId ?? null,
    promptVersion: result.provenance?.promptVersion ?? null,
    reason: result.summary || `Work sample scored ${result.overallScore}/100 (pass mark ${cfg.passThreshold}).`,
    inputs: {
      overallScore: result.overallScore,
      workQualityScore: result.workQualityScore,
      aiSkillScore: result.aiSkillScore,
      passThreshold: cfg.passThreshold,
      rubricUsed: result.rubricUsed,
      mode: result.mode,
    },
  });

  await db.update(candidates)
    .set({
      workSampleScore: result.overallScore,
      workSampleNotes: formatNotes(result, { pass, threshold: cfg.passThreshold, autoRejected }),
      updatedAt: new Date(),
    })
    .where(eq(candidates.id, candidateId));

  // No stage change on a low score — the work sample is advisory and a human decides.
  return result;
}
