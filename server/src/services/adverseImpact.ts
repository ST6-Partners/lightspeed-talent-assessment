// ============================================================
// ADVERSE-IMPACT AUDIT (four-fifths rule) — aggregate only
//
// Computes, per role, the share of each self-identified group that
// cleared the automated assessment gate (CCAT >= ASSESSMENT_PASS_
// THRESHOLD), and flags any group passing at less than four-fifths
// (0.80) of the top-passing group's rate.
//
// Reads decision_log (the deterministic 'assessment_gate' rows) joined
// to eeo_responses. ALL joins are aggregated in SQL (GROUP BY) — no
// candidate-level demographic row ever leaves this module. Groups below
// MIN_SAMPLE are suppressed (no rate, no flag) so tiny cells never drive
// a conclusion or expose individuals.
// ============================================================

import { sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db.js';

export const MIN_SAMPLE = 30;          // below this, don't report a rate
export const FOUR_FIFTHS = 0.8;        // the adverse-impact threshold

export type GroupStatus = 'reference' | 'ok' | 'flagged' | 'insufficient';

export interface GroupResult {
  group: string;
  assessed: number;
  passed: number | null;      // suppressed (null) when assessed < MIN_SAMPLE
  passRate: number | null;    // 0..100, rounded; null when suppressed
  ratio: number | null;       // vs top group, 2dp; null when suppressed
  status: GroupStatus;
}

export interface Dimension {
  key: string;
  label: string;
  reference: string | null;
  groups: GroupResult[];
}

export interface AuditResult {
  jdId: string;
  assessed: number;           // candidates in this role with an assessment_gate decision
  responded: number;          // of those, how many completed the EEO survey
  responseRate: number;       // 0..100, rounded
  integrityGap: number;       // dropped assessment_gate decision writes for this role (audit may be incomplete)
  dimensions: Dimension[];
}

interface RawRow { grp: string; assessed: number; passed: number }

// De-dupe to one assessment_gate row per candidate (latest), scope to the
// role, join completed EEO responses, group by the demographic column.
// `column` is a trusted identifier (never user input) — see callers.
async function tallyByColumn(
  db: DrizzleClient,
  jdId: string,
  column: 'sex' | 'race_ethnicity' | 'veteran_status' | 'disability_status',
): Promise<RawRow[]> {
  const col = sql.raw(`er."${column}"`);
  const res: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (dl.candidate_id) dl.candidate_id, dl.outcome
      FROM decision_log dl
      WHERE dl.decision_type = 'assessment_gate'
      ORDER BY dl.candidate_id, dl.created_at DESC
    )
    SELECT ${col} AS grp,
           COUNT(*)::int AS assessed,
           SUM(CASE WHEN l.outcome = 'passed' THEN 1 ELSE 0 END)::int AS passed
    FROM latest l
    JOIN candidates c ON c.id = l.candidate_id
    JOIN eeo_responses er ON er.candidate_id = c.id AND er.status = 'completed'
    WHERE c.jd_id = ${jdId}
      AND ${col} IS NOT NULL
      AND ${col} <> 'Declined'
    GROUP BY ${col}
    ORDER BY ${col}
  `);
  return (res.rows ?? res) as RawRow[];
}

function buildDimension(key: string, label: string, rows: RawRow[]): Dimension {
  // Eligible = enough sample to score. Reference = highest pass rate among eligible.
  const eligible = rows.filter((r) => r.assessed >= MIN_SAMPLE);
  let referenceRate = 0;
  let reference: string | null = null;
  for (const r of eligible) {
    const rate = r.passed / r.assessed;
    if (rate > referenceRate) { referenceRate = rate; reference = r.grp; }
  }

  const groups: GroupResult[] = rows.map((r) => {
    if (r.assessed < MIN_SAMPLE) {
      return { group: r.grp, assessed: r.assessed, passed: null, passRate: null, ratio: null, status: 'insufficient' };
    }
    const rate = r.passed / r.assessed;
    const ratio = referenceRate > 0 ? rate / referenceRate : null;
    let status: GroupStatus;
    if (r.grp === reference) status = 'reference';
    else if (ratio !== null && ratio < FOUR_FIFTHS) status = 'flagged';
    else status = 'ok';
    return {
      group: r.grp,
      assessed: r.assessed,
      passed: r.passed,
      passRate: Math.round(rate * 100),
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      status,
    };
  });

  // Show larger groups first, keep insufficient rows at the bottom.
  groups.sort((a, b) => {
    if ((a.status === 'insufficient') !== (b.status === 'insufficient')) {
      return a.status === 'insufficient' ? 1 : -1;
    }
    return b.assessed - a.assessed;
  });

  return { key, label, reference, groups };
}

// ── Cutoff what-if (Remediate-this-flag) ───────────────────
// Re-derives the four-fifths tally at an ARBITRARY CCAT cutoff over the
// same audited population, from candidates.ccat_score (not the stored
// pass/fail outcome). This models the one legal, group-blind remediation
// lever the app actually has: moving the cutoff for everyone, then seeing
// whether the disparity shrinks. Same aggregate-only, MIN_SAMPLE-suppressed
// rules as the live audit.
async function tallyByColumnAtCutoff(
  db: DrizzleClient,
  jdId: string,
  column: 'sex' | 'race_ethnicity' | 'veteran_status' | 'disability_status',
  cutoff: number,
): Promise<RawRow[]> {
  const col = sql.raw(`er."${column}"`);
  const res: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (dl.candidate_id) dl.candidate_id
      FROM decision_log dl
      WHERE dl.decision_type = 'assessment_gate'
      ORDER BY dl.candidate_id, dl.created_at DESC
    )
    SELECT ${col} AS grp,
           COUNT(*)::int AS assessed,
           SUM(CASE WHEN c.ccat_score IS NOT NULL AND c.ccat_score >= ${cutoff} THEN 1 ELSE 0 END)::int AS passed
    FROM latest l
    JOIN candidates c ON c.id = l.candidate_id
    JOIN eeo_responses er ON er.candidate_id = c.id AND er.status = 'completed'
    WHERE c.jd_id = ${jdId}
      AND ${col} IS NOT NULL
      AND ${col} <> 'Declined'
    GROUP BY ${col}
    ORDER BY ${col}
  `);
  return (res.rows ?? res) as RawRow[];
}

export interface SimulationResult {
  jdId: string;
  cutoff: number;
  baseCutoff: number;
  addedCount: number;        // pass at `cutoff` but not at baseCutoff (cutoff lowered)
  removedCount: number;      // pass at baseCutoff but not at `cutoff` (cutoff raised)
  addedMedianPercentile: number | null; // median CCAT percentile of the added candidates
  passingAvgPercentile: number | null;  // avg CCAT percentile of the pool passing at `cutoff` (real quality proxy)
  dimensions: Dimension[];
}

export async function simulateCutoffAudit(
  db: DrizzleClient,
  jdId: string,
  cutoff: number,
  baseCutoff = 30,
): Promise<SimulationResult> {
  const [sexRows, raceRows, vetRows, disRows] = await Promise.all([
    tallyByColumnAtCutoff(db, jdId, 'sex', cutoff),
    tallyByColumnAtCutoff(db, jdId, 'race_ethnicity', cutoff),
    tallyByColumnAtCutoff(db, jdId, 'veteran_status', cutoff),
    tallyByColumnAtCutoff(db, jdId, 'disability_status', cutoff),
  ]);

  // Who this cutoff change adds or removes vs the current gate, over the
  // whole role — a real "who does this let through" readout, not a synthetic
  // quality score. Added = below the old bar but at/above the new one.
  const lo = Math.min(cutoff, baseCutoff);
  const hi = Math.max(cutoff, baseCutoff);
  const deltaRes: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (dl.candidate_id) dl.candidate_id
      FROM decision_log dl
      WHERE dl.decision_type = 'assessment_gate'
      ORDER BY dl.candidate_id, dl.created_at DESC
    )
    SELECT c.ccat_score AS score, c.ccat_percentile AS pct
    FROM latest l
    JOIN candidates c ON c.id = l.candidate_id
    WHERE c.jd_id = ${jdId}
      AND c.ccat_score IS NOT NULL
      AND c.ccat_score >= ${lo} AND c.ccat_score < ${hi}
  `);
  const deltaRows = (deltaRes.rows ?? deltaRes) as { score: number; pct: number | null }[];
  const lowered = cutoff < baseCutoff;
  const addedCount = lowered ? deltaRows.length : 0;
  const removedCount = lowered ? 0 : deltaRows.length;
  const pcts = deltaRows.map((r) => r.pct).filter((p): p is number => p != null).sort((a, b) => a - b);
  const addedMedianPercentile = lowered && pcts.length
    ? pcts[Math.floor((pcts.length - 1) / 2)]
    : null;

  // Real quality proxy: the average CCAT percentile of everyone who passes at
  // this cutoff. Lowering the cutoff pulls in lower-percentile candidates, so
  // this genuinely falls — no synthetic score.
  const qRes: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (dl.candidate_id) dl.candidate_id
      FROM decision_log dl
      WHERE dl.decision_type = 'assessment_gate'
      ORDER BY dl.candidate_id, dl.created_at DESC
    )
    SELECT AVG(c.ccat_percentile)::float AS avg_pct
    FROM latest l
    JOIN candidates c ON c.id = l.candidate_id
    WHERE c.jd_id = ${jdId}
      AND c.ccat_score IS NOT NULL AND c.ccat_score >= ${cutoff}
      AND c.ccat_percentile IS NOT NULL
  `);
  const avgPct = (qRes.rows ?? qRes)[0]?.avg_pct;
  const passingAvgPercentile = avgPct != null ? Math.round(Number(avgPct)) : null;

  return {
    jdId,
    cutoff,
    baseCutoff,
    addedCount,
    removedCount,
    addedMedianPercentile,
    passingAvgPercentile,
    dimensions: [
      buildDimension('sex', 'By sex', sexRows),
      buildDimension('raceEthnicity', 'By race / ethnicity', raceRows),
      buildDimension('veteran', 'By veteran status', vetRows),
      buildDimension('disability', 'By disability status', disRows),
    ],
  };
}

export async function runAdverseImpactAudit(db: DrizzleClient, jdId: string): Promise<AuditResult> {
  const [sexRows, raceRows, vetRows, disRows] = await Promise.all([
    tallyByColumn(db, jdId, 'sex'),
    tallyByColumn(db, jdId, 'race_ethnicity'),
    tallyByColumn(db, jdId, 'veteran_status'),
    tallyByColumn(db, jdId, 'disability_status'),
  ]);

  // Coverage: assessed candidates in this role, and how many completed the survey.
  const cov: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (dl.candidate_id) dl.candidate_id
      FROM decision_log dl
      WHERE dl.decision_type = 'assessment_gate'
      ORDER BY dl.candidate_id, dl.created_at DESC
    )
    SELECT
      COUNT(*)::int AS assessed,
      SUM(CASE WHEN er.status = 'completed' THEN 1 ELSE 0 END)::int AS responded
    FROM latest l
    JOIN candidates c ON c.id = l.candidate_id
    LEFT JOIN eeo_responses er ON er.candidate_id = c.id
    WHERE c.jd_id = ${jdId}
  `);
  const covRow = (cov.rows ?? cov)[0] ?? { assessed: 0, responded: 0 };
  const assessed = Number(covRow.assessed) || 0;
  const responded = Number(covRow.responded) || 0;

  // Data-integrity check: assessment_gate decision writes that failed and were
  // dead-lettered for candidates in THIS role. A non-zero value means the audit
  // above is missing those candidates until the writes are replayed.
  const gapRes: any = await db.execute(sql`
    SELECT COUNT(*)::int AS gap
    FROM decision_log_failures f
    JOIN candidates c ON c.id = f.candidate_id
    WHERE f.resolved = false
      AND f.decision_type = 'assessment_gate'
      AND c.jd_id = ${jdId}
  `);
  const integrityGap = Number((gapRes.rows ?? gapRes)[0]?.gap) || 0;

  return {
    jdId,
    assessed,
    responded,
    responseRate: assessed > 0 ? Math.round((responded / assessed) * 100) : 0,
    integrityGap,
    dimensions: [
      buildDimension('sex', 'By sex', sexRows),
      buildDimension('raceEthnicity', 'By race / ethnicity', raceRows),
      buildDimension('veteran', 'By veteran status', vetRows),
      buildDimension('disability', 'By disability status', disRows),
    ],
  };
}
