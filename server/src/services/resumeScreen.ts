// ============================================================
// COMBINED SCREEN (resume requirements + skills fit + EPP/values)
//
// Shared core of the "200 -> 20" screen. Computes the three signals, a
// composite score, and a recommendation (reject | advance | review), then
// PERSISTS them on the candidate. It does NOT change the candidate's stage —
// callers decide what to do:
//   • the manual `runScreen` procedure applies its stage move afterward;
//   • the automatic Candidate-Review entry runs it for scoring only (rejection
//     stays a manual human decision from that stage).
// ============================================================
import { eq } from 'drizzle-orm';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { screenResumeRequirements, scoreSkillsFit } from './ai.js';
import { computeEppScans, buildRoleFitNotes } from './eppScans.js';

export interface CombinedScreenResult {
  recommendation: 'rejected' | 'advanced' | 'review';
  decision: 'rejected' | 'advanced' | 'review';
  reason: string;
  composite: number;
  requirements: any;
  niceToHaves: any;
  skills: any;
  eppMatch: number | null;
  companyValuesMatch: number | null;
  eppScans: any;
  summary: string;
}

/**
 * Score + store the combined screen for a candidate. Returns null when there is
 * no resume on file to screen (caller decides whether that's an error or a skip).
 * Never changes the candidate's stage.
 */
export async function computeAndStoreScreen(
  db: any,
  candidateId: string,
  opts?: { needsSponsorship?: boolean; resumeText?: string },
): Promise<CombinedScreenResult | null> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return null;

  const resumeText = (opts?.resumeText?.trim() || (candidate as any).resumeText || '').trim();
  if (!resumeText) return null;

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const required = ((jd as any)?.requiredQualifications ?? '') as string;
  const preferred = ((jd as any)?.preferredQualifications ?? '') as string;
  const jobTitle = jd?.jobTitle ?? undefined;

  // 1) Requirements gate (must-haves + nice-to-haves).
  const requirements = await screenResumeRequirements(resumeText, required);
  const niceToHaves = await screenResumeRequirements(resumeText, preferred);

  // 2) Skills fit (graded).
  const skills = await scoreSkillsFit(resumeText, {
    jobTitle,
    summary: (jd as any)?.summary ?? null,
    responsibilities: (jd as any)?.responsibilities ?? null,
    requiredQualifications: required,
    preferredQualifications: preferred,
  });

  // 3) EPP scans — overall EPP match + company-values match (from real 12-trait results).
  const eppScans = await computeEppScans(db, candidateId);
  const eppMatch = eppScans.eppMatch;
  const companyValuesMatch = eppScans.companyValuesMatch;

  // Composite = average of the available graded signals (skills + values).
  const graded: number[] = [skills.score];
  if (companyValuesMatch != null) graded.push(companyValuesMatch);
  const composite = Math.round(graded.reduce((a, b) => a + b, 0) / graded.length);

  const trustworthy = requirements.mode === 'ai' && skills.mode === 'ai';
  const ADVANCE_THRESHOLD = 65;

  let decision: 'rejected' | 'advanced' | 'review' = 'review';
  let reason = '';
  if (opts?.needsSponsorship) {
    decision = 'rejected';
    reason = 'Requires international sponsorship, which Lightspeed does not offer.';
  } else if (requirements.mode === 'ai' && requirements.missing.length > 0) {
    decision = 'review';
    reason = `Missing required qualification(s): ${requirements.missing.join('; ')} — flagged for human review (not auto-rejected).`;
  } else if (!trustworthy) {
    decision = 'review';
    reason = 'Advisory only — set the AI key (ANTHROPIC_API_KEY) for the screen to auto-decide.';
  } else if (composite >= ADVANCE_THRESHOLD) {
    decision = 'advanced';
  } else {
    decision = 'review';
    reason = `Requirements met, but combined screen score ${composite}/100 is below the ${ADVANCE_THRESHOLD} bar — needs a human look.`;
  }
  const recommendation = decision;

  const summaryParts = [
    requirements.summary,
    skills.summary,
    eppScans.hasEpp
      ? `EPP match: ${eppMatch}/100. Company-values match: ${companyValuesMatch}/100 (across ${eppScans.scoredValues} values).`
      : 'EPP + company-values match: no EPP results on file yet.',
    `Combined screen score: ${composite}/100. Recommendation: ${decision}.`,
  ];
  if (niceToHaves.missing.length) summaryParts.push(`Nice-to-haves missing (FYI): ${niceToHaves.missing.join('; ')}.`);
  const summary = summaryParts.join(' ');

  await db.update(candidates).set({
    resumeReviewScore: requirements.totalCount ? Math.round((requirements.metCount / requirements.totalCount) * 100) : null,
    resumeReviewNotes: requirements.summary + (niceToHaves.missing.length ? ` Nice-to-haves missing: ${niceToHaves.missing.join('; ')}.` : ''),
    skillsFitScore: skills.score,
    skillsFitNotes: skills.summary,
    ...(eppMatch != null ? { eppValuesMatchScore: eppMatch } : {}),
    ...(companyValuesMatch != null ? { companyValuesMatchScore: companyValuesMatch } : {}),
    // Only overwrite the values note when there is REAL EPP data. In placeholder
    // mode (no EPP scans) keep whatever the placeholder assessment wrote, so the
    // review banner shows the accurate placeholder note, not "no EPP results".
    ...(eppScans.hasEpp ? { companyValuesNotes: buildRoleFitNotes(eppScans) } : {}),
    screenScore: composite,
    screenRecommendation: recommendation,
    ...(recommendation === 'review' ? {
      reviewFlagCount: candidate.screenRecommendation === 'review'
        ? (candidate.reviewFlagCount ?? 0)
        : (candidate.reviewFlagCount ?? 0) + 1,
    } : {}),
    screenSummary: summary,
    screenedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(candidates.id, candidateId));

  return { recommendation, decision, reason, composite, requirements, niceToHaves, skills, eppMatch, companyValuesMatch, eppScans, summary };
}
