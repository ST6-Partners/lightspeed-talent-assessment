// ============================================================
// CANDIDATE RANKING SERVICE (advisory)
//
// Orders the candidates for a role (job description) who passed the
// hard cutoff and are still in play. Builds the role criteria from the
// JD + the hiring-manager's intake intent, asks the AI for a per-candidate
// fit read, sorts, and stores the run. Nothing here advances or rejects a
// candidate — it only produces a best-first review order for a human.
// ============================================================
import { eq, sql } from 'drizzle-orm';
import {
  jobDescriptions,
  jobRequisitions,
  candidateRankings,
  rankingRuns,
} from '../db/schema/hiring.js';
import { rankCandidateFit } from './ai.js';

const MAX_POOL = 60;
const CONCURRENCY = 5;

function textOr(v: any, fallback = ''): string {
  return (v == null ? '' : String(v)).trim() || fallback;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return out;
}

export interface RankRunSummary {
  runId: string;
  total: number;
  criteriaSummary: string;
  limitedData: boolean;
}

export async function rankRoleCandidates(
  db: any,
  jdId: string,
  userId: string | null,
): Promise<RankRunSummary> {
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) });
  if (!jd) throw new Error('job description not found');
  const req = jd.reqId
    ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) })
    : null;

  const parts: string[] = [];
  parts.push(`Title: ${textOr(jd.jobTitle, 'Unknown')}`);
  if (textOr(jd.summary)) parts.push(`Summary: ${textOr(jd.summary)}`);
  if (textOr(jd.responsibilities)) parts.push(`Responsibilities:\n${textOr(jd.responsibilities)}`);
  if (textOr(jd.requiredQualifications)) parts.push(`Required qualifications:\n${textOr(jd.requiredQualifications)}`);
  if (textOr(jd.preferredQualifications)) parts.push(`Nice-to-haves:\n${textOr(jd.preferredQualifications)}`);
  if (req) {
    const intent: string[] = [];
    const fields: Array<[string, any]> = [
      ['Must-haves', req.mustHaves],
      ['Nice-to-haves', req.niceToHaves],
      ['Standout signals', req.standoutSignals],
      ['Dealbreakers', req.dealbreakers],
      ['What great looks like', req.thriveProfile],
      ['Team context', req.teamContext],
    ];
    for (const [label, val] of fields) if (textOr(val)) intent.push(`${label}: ${textOr(val)}`);
    if (intent.length) parts.push(`Hiring-manager intent:\n${intent.join('\n')}`);
  }
  const criteria = parts.join('\n\n');
  const limitedData = !(textOr(jd.responsibilities) && textOr(jd.requiredQualifications));
  const hasIntent = !!(req && [req.mustHaves, req.thriveProfile, req.teamContext].some((x: any) => textOr(x)));
  const criteriaSummary = [textOr(jd.jobTitle, 'role'), hasIntent ? 'manager intake intent' : null]
    .filter(Boolean).join(' · ');

  const poolRows = ((await db.execute(sql`
    SELECT id, first_name, last_name, email, current_stage,
           COALESCE(resume_text, '') AS resume_text,
           COALESCE(screen_summary, '') AS screen_summary,
           COALESCE(resume_review_notes, '') AS resume_review_notes,
           COALESCE(skills_fit_notes, '') AS skills_fit_notes,
           COALESCE(notes, '') AS notes
    FROM candidates
    WHERE jd_id = ${jdId}
      AND current_stage NOT IN ('Rejected', 'Hired', 'Offered')
    ORDER BY created_at DESC
    LIMIT ${MAX_POOL}
  `)) as any).rows as any[];

  const scored = await mapLimit(poolRows, CONCURRENCY, async (c: any) => {
    const material = [
      textOr(c.resume_text),
      textOr(c.screen_summary) && `Screen notes: ${textOr(c.screen_summary)}`,
      textOr(c.resume_review_notes) && `Resume review: ${textOr(c.resume_review_notes)}`,
      textOr(c.skills_fit_notes) && `Skills fit: ${textOr(c.skills_fit_notes)}`,
      textOr(c.notes) && `Notes: ${textOr(c.notes)}`,
    ].filter(Boolean).join('\n\n');
    const r = await rankCandidateFit({
      firstName: c.first_name,
      lastName: c.last_name,
      roleTitle: textOr(jd.jobTitle, 'role'),
      criteria,
      candidateMaterial: material,
    });
    return { c, r };
  });

  scored.sort((a, b) => b.r.sortScore - a.r.sortScore);

  await db.delete(candidateRankings).where(eq(candidateRankings.jdId, jdId));
  await db.delete(rankingRuns).where(eq(rankingRuns.jdId, jdId));

  const [run] = await db.insert(rankingRuns).values({
    jdId,
    reqId: jd.reqId ?? null,
    totalRanked: scored.length,
    criteriaSummary,
    limitedData,
    model: scored[0]?.r.model ?? null,
    createdBy: userId,
  }).returning();

  if (scored.length) {
    await db.insert(candidateRankings).values(
      scored.map((s, i) => ({
        runId: run.id,
        jdId,
        candidateId: s.c.id,
        rank: i + 1,
        sortScore: s.r.sortScore,
        recommendation: s.r.recommendation,
        strengths: s.r.strengths,
        concerns: s.r.concerns,
      })),
    );
  }

  return { runId: run.id, total: scored.length, criteriaSummary, limitedData };
}
