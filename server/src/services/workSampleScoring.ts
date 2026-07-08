// ============================================================
// WORK-SAMPLE SCORING ORCHESTRATION
//
// Loads a candidate + the resolved work-sample task (with its
// current rubric), runs the rubric-driven scorer, and writes the
// overall score + a human-readable rationale onto the candidate.
//
// Advisory: it fills in workSampleScore + workSampleNotes for a
// human to review. It does NOT change the candidate's stage.
// Used by: workSample.submit (auto, fire-and-forget) and
// workSample.rescore (manual re-run after a rubric changes).
// ============================================================
import { eq } from 'drizzle-orm';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { resolveDeptWorkSample } from './workSampleResolver.js';
import { scoreWorkSample, type WorkSampleScoreResult } from './ai.js';

function formatNotes(r: WorkSampleScoreResult): string {
  const lines: string[] = [];
  lines.push(
    `AI work-sample score: ${r.overallScore}/100 (work quality ${r.workQualityScore}, AI skill ${r.aiSkillScore})` +
    `${r.rubricUsed ? '' : ' — no rubric configured; scored from brief'} · ` +
    `${r.mode === 'placeholder' ? 'sandbox draft' : 'AI draft — verify before relying on it'}`,
  );
  if (r.summary) lines.push('', r.summary);
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

  await db.update(candidates)
    .set({ workSampleScore: result.overallScore, workSampleNotes: formatNotes(result), updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  return result;
}
