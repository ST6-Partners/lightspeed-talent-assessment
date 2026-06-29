// ============================================================
// EPP scoring helpers — shared by the EPP viewer and the
// values scoring form. Percentile (0–100) → 1–5 band, and the
// EPP-derived suggested score for a value (avg of its mapped
// EPP traits, banded). See 2-Design/Values Scoring Rubric.
// ============================================================

export const EPP_TRAITS = [
  'Achievement', 'Assertiveness', 'Competitiveness', 'Conscientiousness',
  'Cooperativeness', 'Extroversion', 'Managerial', 'Motivation',
  'Openness', 'Patience', 'Self-Confidence', 'Stress Tolerance',
] as const;

export function percentileToScore(p: number): number {
  if (p >= 85) return 5;
  if (p >= 70) return 4;
  if (p >= 55) return 3;
  if (p >= 30) return 2;
  return 1;
}

export function bandLabel(p: number): string {
  if (p >= 85) return 'Exceptional';
  if (p >= 70) return 'Strong';
  if (p >= 55) return 'Solid';
  if (p >= 30) return 'Developing';
  return 'Weak';
}

// Suggested 1–5 for a value: average the candidate's percentiles across the
// value's mapped EPP traits, then band the average. Returns null if no EPP
// data for any mapped trait.
export function suggestedValueScore(
  eppDimensions: string[],
  eppByTrait: Record<string, number>,
): { score: number; avgPercentile: number } | null {
  const got = (eppDimensions || [])
    .map((t) => eppByTrait[t])
    .filter((n) => typeof n === 'number') as number[];
  if (!got.length) return null;
  const avg = Math.round(got.reduce((a, b) => a + b, 0) / got.length);
  return { score: percentileToScore(avg), avgPercentile: avg };
}
