// ============================================================
// DECISION LOG — Phase 2 (decision provenance & transparency)
//
// One row per candidate-affecting decision, whether made by a
// deterministic rule (score threshold), an AI call, or a human.
// This is the "can anyone explain how the decision was made?" record:
// it captures the model actually used, the prompt id + version, the
// inputs that drove it, the score, the outcome, and a plain-language,
// job-related reason.
//
// Distinct from `candidate_stage_history` (which records stage moves):
// a decision may recommend an outcome without moving a stage, and it
// carries the model/prompt provenance that stage history does not.
// ============================================================

import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';
import { users } from './core.js';

export const decisionLog = pgTable('decision_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),

  // What kind of decision this is.
  //   'assessment_gate' | 'post_assessment_review' | 'resume_screen'
  //   | 'work_sample' | 'interview_questions' | 'interview_feedback'
  //   | 'reference_check'
  decisionType: varchar('decision_type', { length: 50 }).notNull(),

  // Outcome of the decision.
  //   'advanced' | 'rejected' | 'pending_review' | 'passed' | 'failed'
  //   | 'scored' | 'generated'
  outcome: varchar('outcome', { length: 30 }).notNull(),

  // Numeric score behind the decision, when there is one (0–100 or raw).
  score: integer('score'),

  // Who/what made the decision.
  //   'ai' | 'deterministic' | 'human'
  decidedByType: varchar('decided_by_type', { length: 20 }).notNull().default('ai'),
  // Set only when a human made or confirmed the decision.
  decidedBy: uuid('decided_by').references(() => users.id),

  // Provenance (null for deterministic/human-only decisions).
  model: varchar('model', { length: 80 }),          // resolved model id from the API
  requestedModel: varchar('requested_model', { length: 80 }),
  promptId: varchar('prompt_id', { length: 80 }),
  promptVersion: varchar('prompt_version', { length: 20 }),

  // Plain-language, job-related explanation of the decision.
  reason: text('reason').notNull(),

  // The structured inputs that drove the decision (scores, thresholds,
  // missing requirements, token usage, etc.) — never protected data.
  inputs: jsonb('inputs'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
