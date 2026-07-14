// ============================================================
// CANDIDATE RANKING SERVICE (advisory, live)
//
// Orders the candidates for a role (job description) against the JD +
// the hiring-manager's intake intent. Two entry points:
//   - rankRoleCandidates: (re)rank the whole pool for a role.
//   - rankOneCandidateIntoRole: score a single candidate and slot them
//     into the role's ranking (called when someone applies, so the
//     ranking stays live as the pipeline grows).
// Nothing here advances or rejects a candidate. Personality/EPP is
// deliberately NOT used. The fit score is internal ordering only.
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
const DROPPED_STAGES = ['Rejected', 'Hired', 'Offered'];

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

interface Criteria {
  criteria: string;
  criteriaSummary: string;
  limitedData: boolean;
}

function buildCriteria(jd: any, req: any): Criteria {
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
  const hasIntent = !!(req && [req.mustHaves, req.thriveProfile, req.teamContext].some((x: any) => textOr(x)));
  return {
    criteria: parts.join('\n\n'),
    criteriaSummary: [textOr(jd.jobTitle, 'role'), hasIntent ? 'manager intake intent' : null].filter(Boolean).join(' · '),
    limitedData: !(textOr(jd.responsibilities) && textOr(jd.requiredQualifications)),
  };
}

function materialFrom(c: any): string {
  return [
    textOr(c.resume_text),
    textOr(c.screen_summary) && `Screen notes: ${textOr(c.screen_summary)}`,
    textOr(c.resume_review_notes) && `Resume review: ${textOr(c.resume_review_notes)}`,
    textOr(c.skills_fit_notes) && `Skills fit: ${textOr(c.skills_fit_notes)}`,
    textOr(c.notes) && `Notes: ${textOr(c.notes)}`,
  ].filter(Boolean).join('\n\n');
}

async function ensureRun(db: any, jd: any, crit: Criteria, userId: string | null, model: string | null) {
  const [existing] = await db.select().from(rankingRuns).where(eq(rankingRuns.jdId, jd.id)).limit(1);
  if (existing) return existing;
  const [run] = await db.insert(rankingRuns).values({
    jdId: jd.id,
    reqId: jd.reqId ?? null,
    totalRanked: 0,
    criteriaSummary: crit.criteriaSummary,
    limitedData: crit.limitedData,
    model,
    createdBy: userId,
  }).returning();
  return run;
}

export interface RankRunSummary {
  runId: string;
  total: number;
  criteriaSummary: string;
  limitedData: boolean;
}

export async function rankRoleCandidates(db: any, jdId: string, userId: string | null): Promise<RankRunSummary> {
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) });
  if (!jd) throw new Error('job description not found');
  const req = jd.reqId ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) }) : null;
  const crit = buildCriteria(jd, req);

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
    const r = await rankCandidateFit({
      firstName: c.first_name,
      lastName: c.last_name,
      roleTitle: textOr(jd.jobTitle, 'role'),
      criteria: crit.criteria,
      candidateMaterial: materialFrom(c),
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
    criteriaSummary: crit.criteriaSummary,
    limitedData: crit.limitedData,
    model: scored[0]?.r.model ?? null,
    createdBy: userId,
  }).returning();

  if (scored.length) {
    await db.insert(candidateRankings).values(scored.map((s, i) => ({
      runId: run.id,
      jdId,
      candidateId: s.c.id,
      rank: i + 1,
      sortScore: s.r.sortScore,
      recommendation: s.r.recommendation,
      strengths: s.r.strengths,
      concerns: s.r.concerns,
    })));
  }

  return { runId: run.id, total: scored.length, criteriaSummary: crit.criteriaSummary, limitedData: crit.limitedData };
}

// Score ONE candidate against their role and slot them into the ranking.
// Fire-and-forget from candidate create so the ranking stays live. Never throws.
export async function rankOneCandidateIntoRole(db: any, candidateId: string, userId: string | null): Promise<void> {
  try {
    const rows = ((await db.execute(sql`
      SELECT id, jd_id, first_name, last_name, current_stage,
             COALESCE(resume_text, '') AS resume_text,
             COALESCE(screen_summary, '') AS screen_summary,
             COALESCE(resume_review_notes, '') AS resume_review_notes,
             COALESCE(skills_fit_notes, '') AS skills_fit_notes,
             COALESCE(notes, '') AS notes
      FROM candidates WHERE id = ${candidateId} LIMIT 1
    `)) as any).rows as any[];
    const c = rows[0];
    if (!c || !c.jd_id) return;
    if (DROPPED_STAGES.includes(c.current_stage)) return;

    const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, c.jd_id) });
    if (!jd) return;
    const req = jd.reqId ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) }) : null;
    const crit = buildCriteria(jd, req);

    const r = await rankCandidateFit({
      firstName: c.first_name,
      lastName: c.last_name,
      roleTitle: textOr(jd.jobTitle, 'role'),
      criteria: crit.criteria,
      candidateMaterial: materialFrom(c),
    });

    const run = await ensureRun(db, jd, crit, userId, r.model);

    await db.delete(candidateRankings).where(eq(candidateRankings.candidateId, candidateId));
    await db.insert(candidateRankings).values({
      runId: run.id,
      jdId: jd.id,
      candidateId,
      rank: 0,
      sortScore: r.sortScore,
      recommendation: r.recommendation,
      strengths: r.strengths,
      concerns: r.concerns,
    });

    const [{ n }] = ((await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM candidate_rankings WHERE jd_id = ${jd.id}
    `)) as any).rows as any[];
    await db.update(rankingRuns).set({ totalRanked: n }).where(eq(rankingRuns.id, run.id));
    console.log(`[Ranking] slotted ${c.first_name} ${c.last_name} into role ${jd.jobTitle} (live)`);
  } catch (err) {
    console.error('[Ranking] rankOneCandidateIntoRole failed:', err);
  }
}
