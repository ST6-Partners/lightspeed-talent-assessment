// ============================================================
// DECISION LOG SERVICE — Phase 2 (decision provenance)
//
// logDecision() writes one provenance row for a candidate-affecting
// decision. It is intentionally best-effort: a logging failure must
// NEVER block or change the decision itself, so all writes are wrapped
// and errors are swallowed (logged to console only).
// ============================================================

import { decisionLog } from '../db/schema/decisions.js';

export type DecisionType =
  | 'assessment_gate'
  | 'post_assessment_review'
  | 'resume_screen'
  | 'work_sample'
  | 'interview_questions'
  | 'interview_feedback'
  | 'reference_check'
  | 'manual_stage_change'
  | 'requisition_closed';

export type DecisionOutcome =
  | 'advanced'
  | 'rejected'
  | 'pending_review'
  | 'passed'
  | 'failed'
  | 'scored'
  | 'generated'
  | 'moved'
  | 'not_selected';

export interface LogDecisionInput {
  candidateId: string;
  decisionType: DecisionType;
  outcome: DecisionOutcome;
  reason: string;
  score?: number | null;
  decidedByType?: 'ai' | 'deterministic' | 'human';
  decidedBy?: string | null;
  model?: string | null;
  requestedModel?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  inputs?: Record<string, unknown> | null;
}

/**
 * Persist a decision-provenance row. Best-effort; never throws.
 * `db` is the drizzle instance (ctx.db).
 */
export async function logDecision(db: any, input: LogDecisionInput): Promise<void> {
  try {
    await db.insert(decisionLog).values({
      candidateId: input.candidateId,
      decisionType: input.decisionType,
      outcome: input.outcome,
      reason: input.reason,
      score: input.score ?? null,
      decidedByType: input.decidedByType ?? 'ai',
      decidedBy: input.decidedBy ?? null,
      model: input.model ?? null,
      requestedModel: input.requestedModel ?? null,
      promptId: input.promptId ?? null,
      promptVersion: input.promptVersion ?? null,
      inputs: input.inputs ?? null,
    });
  } catch (err) {
    console.error('[decisionLog] failed to record decision (non-fatal):', err);
  }
}
