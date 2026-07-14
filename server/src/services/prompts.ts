// ============================================================
// PROMPT REGISTRY — Phase 2 (decision provenance & transparency)
//
// Every AI call that influences a candidate's outcome references a
// prompt entry here. The registry gives each prompt a STABLE ID and a
// VERSION so that:
//   1. Each decision we log records exactly which prompt (and version)
//      produced it — answering the audit question "how was this
//      decision made?"
//   2. A prompt change is a reviewable code change: bump `version`,
//      add a `changelog` line, and the diff shows what changed.
//
// CONTRACT (read before editing a prompt):
//   The prompt TEXT lives next to the function that uses it in
//   `ai.ts` (kept there so the interpolation stays readable). When you
//   change that text in any way that could change model behavior, you
//   MUST bump the matching `version` here and add a changelog note.
//   Treat a version bump like a schema migration: it is the record
//   that the decision logic changed on a date, for a reason.
//
// The resolved model id is captured at call time from the API response
// (see `callClaudeMeta` in ai.ts) — the `model` field here is only the
// requested alias/default.
// ============================================================

export interface PromptEntry {
  id: string;            // stable identifier, stored on every decision
  version: string;       // bump on any behavior-affecting text change
  model: string;         // requested model alias/default for this prompt
  purpose: string;       // one-line description of what it decides
  lastRevised: string;   // ISO date of the last version bump
  changelog: string[];   // newest first
}

export const PROMPTS = {
  resumeScreen: {
    id: 'resume-screen',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    purpose: 'Screen a resume against REQUIRED qualifications only; flag missing requirements without ranking or rejecting.',
    lastRevised: '2026-07-14',
    changelog: ['1.0.0 — initial registry entry (text unchanged from pre-registry baseline).'],
  },
  workSampleScore: {
    id: 'work-sample-score',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    purpose: 'Score a work sample strictly against the configured rubric; AI draft to inform a human, never final.',
    lastRevised: '2026-07-14',
    changelog: ['1.0.0 — initial registry entry.'],
  },
  interviewFeedback: {
    id: 'interview-feedback',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    purpose: 'Analyze an interview transcript into HR report, candidate feedback, and interviewer coaching.',
    lastRevised: '2026-07-14',
    changelog: ['1.0.0 — initial registry entry.'],
  },
  interviewQuestions: {
    id: 'interview-questions',
    version: '1.0.0',
    model: 'claude-sonnet-4-6',
    purpose: 'Generate the ~30% candidate-tailored interview questions from prior signals.',
    lastRevised: '2026-07-14',
    changelog: ['1.0.0 — initial registry entry.'],
  },
} as const;

export type PromptKey = keyof typeof PROMPTS;
