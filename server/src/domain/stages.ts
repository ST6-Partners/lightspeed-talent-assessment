// ============================================================
// CANDIDATE STAGES — single source of truth
//
// The pipeline order and every stage subset used to live as ~13 separate
// hardcoded arrays across the server and client (funnel, active, dropped,
// terminal, auto-reject, closed, backfill, two STAGES lists, plus inline
// SQL copies). They had to be edited in lockstep, and missing one produced
// silent bugs. This module defines the order ONCE and derives the subsets.
//
// Pure constants + helpers, no imports — safe to import from both the
// server and the client bundle.
//
// NOTE: the Postgres enum `candidateStageEnum` (in db/schema/hiring.ts) is
// the database contract and is declared separately (adding a stage there
// requires an ALTER TYPE migration). It must contain the SAME set of values
// as CANDIDATE_STAGES; its declaration order is cosmetic and need not match.
// ============================================================

// Advancement / flow order (what next-stage, previous-stage, the stage
// filter, and the funnel all read). Terminal stages sit at the end.
export const CANDIDATE_STAGES = [
  'Applied',
  'Assessment',
  'Values Review',
  'Work Sample',
  'Phone Screen',
  'Interview Scheduled',
  'Interviewed',
  'Offered',
  'Hired',
  'Rejected',
  'Not Selected',
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

const has = (list: readonly string[], s: string) => list.includes(s);

// Finished — never advanced out of.
export const TERMINAL_STAGES: readonly string[] = ['Rejected', 'Hired', 'Not Selected'];
// Closed-out but not hired (rejected on merits, or role closed/filled).
export const CLOSED_STAGES: readonly string[] = ['Rejected', 'Not Selected'];
// Still in flight — everything up to and including Offered.
export const ACTIVE_STAGES: readonly string[] = CANDIDATE_STAGES.filter((s) => !has(TERMINAL_STAGES, s));
// Non-terminal pipeline including Hired — the funnel display set.
export const PIPELINE_STAGES: readonly string[] = CANDIDATE_STAGES.filter((s) => !has(CLOSED_STAGES, s));
// Mid-pipeline stages eligible for advisory ranking (past the cutoff, pre-offer).
export const RANKABLE_STAGES: readonly string[] = ['Work Sample', 'Values Review', 'Phone Screen', 'Interview Scheduled', 'Interviewed'];
// Everything NOT eligible for ranking (used by the ranking exclusion filters).
export const NOT_RANKABLE_STAGES: readonly string[] = CANDIDATE_STAGES.filter((s) => !has(RANKABLE_STAGES, s));
// Early stages where a failing work sample can auto-reject.
export const AUTO_REJECT_STAGES: readonly string[] = ['Applied', 'Assessment', 'Work Sample'];

export function isTerminal(s: string): boolean { return has(TERMINAL_STAGES, s); }
export function isActive(s: string): boolean { return has(ACTIVE_STAGES, s); }

export function nextStage(s: string): CandidateStage | null {
  const i = (CANDIDATE_STAGES as readonly string[]).indexOf(s);
  return i >= 0 && i < CANDIDATE_STAGES.length - 1 ? CANDIDATE_STAGES[i + 1] : null;
}
export function prevStage(s: string): CandidateStage | null {
  const i = (CANDIDATE_STAGES as readonly string[]).indexOf(s);
  return i > 0 ? CANDIDATE_STAGES[i - 1] : null;
}

// Quote a stage list for a raw SQL IN (...) clause. Stage values are fixed
// literals (no quotes), so this is safe for the known set.
export function sqlStageList(stages: readonly string[]): string {
  return stages.map((s) => `'${s}'`).join(', ');
}
