// ============================================================
// EPP ANALYZER — Compare candidate EPP profile against
// job description company values to produce a match score.
//
// Criteria Corp EPP returns Big Five + sub-scales as percentiles.
// This maps those dimensions to the Lightspeed company value labels
// stored in job_descriptions.epp_values.
// ============================================================

// ── Value → EPP dimension mapping ─────────────────────────
// Update EPP_DIMENSION_KEYS to match your Criteria Corp EPP output keys.
// The values on the left are the strings stored in job_descriptions.epp_values.

interface ValueMapping {
  dimensions: string[];   // EPP output keys to average
  minScore: number;       // minimum average percentile to count as matched
}

const VALUE_MAP: Record<string, ValueMapping> = {
  integrity:        { dimensions: ['agreeableness', 'cooperativeness'],             minScore: 60 },
  accountability:   { dimensions: ['conscientiousness', 'dependability'],           minScore: 65 },
  collaboration:    { dimensions: ['agreeableness', 'sociability'],                 minScore: 55 },
  innovation:       { dimensions: ['openness', 'extraversion'],                     minScore: 50 },
  'customer focus': { dimensions: ['agreeableness', 'sociability', 'conscientiousness'], minScore: 60 },
  excellence:       { dimensions: ['conscientiousness', 'achievement', 'order'],    minScore: 65 },
  respect:          { dimensions: ['agreeableness', 'cooperativeness'],             minScore: 60 },
  transparency:     { dimensions: ['agreeableness', 'emotional_stability'],         minScore: 55 },
  adaptability:     { dimensions: ['openness', 'emotional_stability'],              minScore: 50 },
  ownership:        { dimensions: ['conscientiousness', 'achievement'],             minScore: 65 },
  empathy:          { dimensions: ['agreeableness', 'sociability'],                 minScore: 60 },
  drive:            { dimensions: ['conscientiousness', 'achievement', 'extraversion'], minScore: 60 },
  impact:           { dimensions: ['conscientiousness', 'achievement'],             minScore: 60 },
  resilience:       { dimensions: ['emotional_stability'],                          minScore: 55 },
  leadership:       { dimensions: ['extraversion', 'achievement'],                  minScore: 60 },
};

export const DEFAULT_PASS_THRESHOLD = 70;

// ── Types ──────────────────────────────────────────────────

export interface ValueBreakdownItem {
  value: string;
  status: 'match' | 'gap' | 'unmapped' | 'missing_data';
  score: number | null;
  minRequired?: number;
  dimensions?: string[];
  dimensionScores?: Record<string, number | null>;
  note?: string;
}

export interface EppAnalysisResult {
  score: number | null;           // 0–100 overall average
  pass: boolean;
  threshold: number;
  matchedValues: number;
  gapValues: number;
  totalValues: number;
  breakdown: ValueBreakdownItem[];
  error?: string;
}

// ── Core analyzer ──────────────────────────────────────────

export function analyzeEpp(
  eppProfile: Record<string, number>,
  requiredValues: string[],
  threshold: number = DEFAULT_PASS_THRESHOLD,
): EppAnalysisResult {
  if (!eppProfile || typeof eppProfile !== 'object' || Array.isArray(eppProfile)) {
    return { error: 'No EPP profile available', score: null, pass: false, threshold, matchedValues: 0, gapValues: 0, totalValues: requiredValues.length, breakdown: [] };
  }
  if (!requiredValues || requiredValues.length === 0) {
    return { error: 'No values configured for this job', score: null, pass: false, threshold, matchedValues: 0, gapValues: 0, totalValues: 0, breakdown: [] };
  }

  const breakdown: ValueBreakdownItem[] = [];
  let totalScore = 0;
  let scoredCount = 0;

  for (const value of requiredValues) {
    const key = value.toLowerCase().trim();
    const mapping = VALUE_MAP[key];

    if (!mapping) {
      breakdown.push({ value, status: 'unmapped', score: null, note: `No EPP mapping for "${value}" — add to VALUE_MAP in eppAnalyzer.ts` });
      continue;
    }

    const dimensionScores = mapping.dimensions.map(d => eppProfile[d] ?? null);
    const validScores = dimensionScores.filter((s): s is number => s !== null);

    if (validScores.length === 0) {
      breakdown.push({ value, status: 'missing_data', score: null, dimensions: mapping.dimensions, note: `EPP profile missing: ${mapping.dimensions.join(', ')}` });
      continue;
    }

    const avg = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
    const matched = avg >= mapping.minScore;

    breakdown.push({
      value,
      status: matched ? 'match' : 'gap',
      score: avg,
      minRequired: mapping.minScore,
      dimensions: mapping.dimensions,
      dimensionScores: Object.fromEntries(mapping.dimensions.map(d => [d, eppProfile[d] ?? null])),
    });

    totalScore += avg;
    scoredCount++;
  }

  const overallScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;
  const matchedValues = breakdown.filter(b => b.status === 'match').length;
  const gapValues = breakdown.filter(b => b.status === 'gap').length;

  return {
    score: overallScore,
    pass: overallScore >= threshold,
    threshold,
    matchedValues,
    gapValues,
    totalValues: requiredValues.length,
    breakdown,
  };
}
