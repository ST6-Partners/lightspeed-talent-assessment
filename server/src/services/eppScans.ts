// ============================================================
// EPP SCANS — two distinct, EPP-derived scores computed from the
// candidate's REAL 12-trait Criteria results (candidate_epp_scores),
// the same data the EPP Profiles and Score Values pages use:
//
//   • eppMatch          — overall EPP strength: the average of the
//                          candidate's 12 trait percentiles (0-100).
//   • companyValuesMatch — how those traits map onto the Lightspeed
//                          company values. For each active company
//                          value, average the candidate's percentiles
//                          across that value's mapped EPP traits
//                          (company_values.epp_dimensions); then
//                          average across values. Identical logic to
//                          the Score Values page, so the numbers tie out.
//
// Kept separate from eppAnalyzer.ts (which uses a legacy Big-Five map)
// so the two signals never get mixed up. Scores are provisional.
// ============================================================

import { eq } from 'drizzle-orm';
import { candidateEppScores } from '../db/schema/epp.js';
import { companyValues } from '../db/schema/values.js';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';

export interface CompanyValueBreakdownItem {
  value: string;
  avgPercentile: number | null;   // null = no EPP data for this value's traits
  dimensions: string[];
}

export interface EppScansResult {
  hasEpp: boolean;
  traitCount: number;
  eppMatch: number | null;             // 0-100 overall EPP strength
  companyValuesMatch: number | null;   // 0-100 avg across scored company values
  scoredValues: number;
  totalValues: number;
  breakdown: CompanyValueBreakdownItem[];
  roleScoped: boolean;                 // true = scored against the JD's selected values
  roleValueNames: string[];            // value names used for the match
}

function avg(nums: number[]): number {
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// db is the drizzle instance (ctx.db). Reads the candidate's 12-trait EPP and
// the active company-value framework, and returns both scans.
export async function computeEppScans(db: any, candidateId: string): Promise<EppScansResult> {
  const rows = await db.query.candidateEppScores.findMany({ where: eq(candidateEppScores.candidateId, candidateId) });
  const eppByTrait: Record<string, number> = {};
  for (const r of rows as Array<{ trait: string; percentile: number }>) {
    if (typeof r.percentile === 'number') eppByTrait[r.trait] = r.percentile;
  }
  const traitCount = Object.keys(eppByTrait).length;
  if (traitCount === 0) {
    return { hasEpp: false, traitCount: 0, eppMatch: null, companyValuesMatch: null, scoredValues: 0, totalValues: 0, breakdown: [], roleScoped: false, roleValueNames: [] };
  }

  const eppMatch = avg(Object.values(eppByTrait));

  // Which company values define "fit for this role"? The JD's selected eppValues
  // (company value names). Fall back to all active values when the JD lists none
  // (or when none of its names match an active value).
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  const jd = candidate?.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jdValueNames: string[] = Array.isArray((jd as any)?.eppValues) ? ((jd as any).eppValues as string[]) : [];

  const activeValues = await db.query.companyValues.findMany({ where: eq(companyValues.active, true) });
  const scopedValues = jdValueNames.length
    ? (activeValues as Array<{ name: string }>).filter((v) => jdValueNames.includes(v.name))
    : [];
  const roleScoped = scopedValues.length > 0;
  const values = roleScoped ? scopedValues : activeValues;
  const breakdown: CompanyValueBreakdownItem[] = [];
  const perValueAverages: number[] = [];
  for (const v of values as Array<{ name: string; eppDimensions: unknown }>) {
    const dims: string[] = Array.isArray(v.eppDimensions) ? v.eppDimensions as string[] : [];
    const got = dims.map((d) => eppByTrait[d]).filter((n): n is number => typeof n === 'number');
    const avgPercentile = got.length ? avg(got) : null;
    if (avgPercentile != null) perValueAverages.push(avgPercentile);
    breakdown.push({ value: v.name, avgPercentile, dimensions: dims });
  }

  const companyValuesMatch = perValueAverages.length ? avg(perValueAverages) : null;
  return {
    hasEpp: true,
    traitCount,
    eppMatch,
    companyValuesMatch,
    scoredValues: perValueAverages.length,
    totalValues: (values as unknown[]).length,
    breakdown,
    roleScoped,
    roleValueNames: (values as Array<{ name: string }>).map((v) => v.name),
  };
}


// Upsert a candidate's EPP results (keyed by the 12 Criteria trait names) into
// candidate_epp_scores — the store the whole app reads — then return both scans.
// Call this from the Criteria refresh/webhook path so real assessment results
// actually drive EPP + company-values screening.
export async function ingestEppResults(
  db: any,
  candidateId: string,
  epp: Record<string, number>,
): Promise<EppScansResult> {
  const entries = Object.entries(epp || {}).filter(([, v]) => typeof v === 'number');
  for (const [trait, percentile] of entries) {
    const p = Math.max(0, Math.min(100, Math.round(percentile)));
    await db.insert(candidateEppScores)
      .values({ candidateId, trait, percentile: p })
      .onConflictDoUpdate({
        target: [candidateEppScores.candidateId, candidateEppScores.trait],
        set: { percentile: p, updatedAt: new Date() },
      });
  }
  return computeEppScans(db, candidateId);
}


// Human-readable role-fit notes: how the candidate does/doesn't fit the role,
// value by value, from their EPP percentiles. Deterministic (no AI) so it is
// transparent and defensible.
export function buildRoleFitNotes(scans: EppScansResult): string {
  if (!scans.hasEpp) return 'No EPP results on file yet — role fit will populate once assessment results arrive.';
  const scope = scans.roleScoped
    ? `the values selected for this role (${scans.roleValueNames.join(', ')})`
    : 'all active company values (no role-specific values are set on this job description)';
  const lines: string[] = [`Role fit — the candidate's EPP results scored against ${scope}.`, ''];
  for (const b of scans.breakdown) {
    if (b.avgPercentile == null) { lines.push(`- ${b.value}: no EPP data for the mapped traits`); continue; }
    const tier = b.avgPercentile >= 70 ? 'strong fit'
      : b.avgPercentile >= 55 ? 'moderate fit'
      : 'below the bar — probe in the interview';
    lines.push(`- ${b.value}: ${b.avgPercentile}% — ${tier}`);
  }
  lines.push('');
  lines.push(`Overall role-values match: ${scans.companyValuesMatch != null ? scans.companyValuesMatch + '%' : 'n/a'} across ${scans.scoredValues} of ${scans.roleValueNames.length || scans.totalValues} value(s).`);
  return lines.join('\n');
}
