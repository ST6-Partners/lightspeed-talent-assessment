// ============================================================
// FEEDBACK TABLES — user feedback + attachments (SC-002)
// + AI review + propose-and-approve agent (SC-034 Debug-Agent Harness)
//
// Conforms to Feedback/Agent Contract v1.0 (default-to-Signal).
// AI/agent fields and the two new tables mirror Signal's proven
// shapes: migrations 016-debug-agent.sql + 028-feedback-review-attempts.sql.
// Stage A1 of the template-first build plan (06-03-26).
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './core.js';
import { screenInventory } from './core.js';

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 30 }).notNull(),
    // 'bug' | 'enhancement' | 'question' | 'business_process'
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  aiDescription: text('ai_description'),
  severity: varchar('severity', { length: 20 }),
    // 'blocking' | 'annoying' | 'nice_to_have'
  affectedScope: varchar('affected_scope', { length: 20 }),
    // 'just_me' | 'my_team' | 'everyone'
  screenId: uuid('screen_id').references(() => screenInventory.id),
  screenPath: varchar('screen_path', { length: 255 }),
  contextEntityId: uuid('context_entity_id'),
  contextEntityType: varchar('context_entity_type', { length: 100 }),
  contextSnapshot: jsonb('context_snapshot'),
  chatDebugLogId: uuid('chat_debug_log_id'),
    // FK added after chatDebugLog is defined
  status: varchar('status', { length: 20 }).notNull().default('open'),
    // 'open' | 'acknowledged' | 'in_progress' | 'pm_review' | 'resolved' | 'wont_fix'
    // (Contract v1.0 §3.3: pm_review = agent diagnosed but did not fix; resolved is the
    //  only terminal "done" value — there is NO 'closed'.)
  adminNotes: text('admin_notes'),
    // Per Contract v1.0 §3.4, the structured agent diagnosis is serialized as a JSON
    // string into admin_notes (Signal's tested shape; FeedbackPanel renders it).
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),

  // ── AI review fields (Contract v1.0 §3.1 / §5) ──────────────
  // Both the user's originals (title/description) and the AI-enhanced text
  // are stored alongside each other — originals are never overwritten.
  aiTitle: text('ai_title'),                                      // claude_title
  aiPriority: varchar('ai_priority', { length: 10 }),             // 'high'|'medium'|'low'|'unset'
  aiPriorityReasoning: text('ai_priority_reasoning'),
  aiSeverity: varchar('ai_severity', { length: 10 }),             // 'sev1'|'sev2'|'sev3' (see note)
  aiReviewResult: jsonb('ai_review_result'),                      // pre-submit analysis object | null
  aiReviewStatus: varchar('ai_review_status', { length: 20 }).default('skipped'),
    // 'skipped' | 'reviewed' | 'deflected'
  clusterRootId: uuid('cluster_root_id'),                         // dedup/clustering root
  reviewAttemptId: uuid('review_attempt_id'),                     // -> feedback_review_attempts.id

  // ── Agent attribution + propose-and-approve fields ──────────
  // (Contract v1.0 §3.1 agent attribution + the propose-and-approve flow)
  resolvedByType: varchar('resolved_by_type', { length: 20 }).default('human'),  // 'human'|'agent'
  agentRunId: varchar('agent_run_id', { length: 64 }),           // -> agent_runs.id (run slug); null for human-resolved
                                                                  // (Signal 016 shape: VARCHAR, not uuid — the run id is a slug)
  agentStatus: varchar('agent_status', { length: 30 }),
    // in_progress | auto_fixed | pm_review | skipped | failed_smoke_test
  agentDiagnosis: jsonb('agent_diagnosis'),                       // structured diagnosis (also mirrored to admin_notes string)
  agentPrUrl: text('agent_pr_url'),                               // PR opened by the agent — human merges to apply
  agentAttemptCount: integer('agent_attempt_count').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const feedbackAttachments = pgTable('feedback_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id').notNull().references(() => feedback.id, { onDelete: 'cascade' }),
  imageData: text('image_data'), // Base64 encoded — BYTEA in production
  mimeType: varchar('mime_type', { length: 100 }),
  filename: varchar('filename', { length: 255 }),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ============================================================
// feedback_review_attempts — pre-submit AI review deflection tracking
// Mirrors Signal migration 028 + Contract v1.0 §5 telemetry.
// Every pre-submit review call inserts a row. If the user then submits,
// the row is linked via resulted_in_feedback_id. Rows with no resulting
// feedback = the deflection signal we want to measure.
// ============================================================
export const feedbackReviewAttempts = pgTable('feedback_review_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  feedbackType: varchar('feedback_type', { length: 30 }).notNull(),
  screenPath: varchar('screen_path', { length: 255 }),
  rawInput: text('raw_input'),                       // user's original title/description as submitted to review
  contextSnapshot: jsonb('context_snapshot'),
  aiReviewResult: jsonb('ai_review_result').notNull().default({}),
    // { outcome, duplicate_found, duplicate_title?, answer_found, answer?,
    //   similar_count, matches[], suggested_priority?, cleaned_title?, ai_description? }
  toolCalls: jsonb('tool_calls'),                    // corpus/duplicate lookups made during review
  model: varchar('model', { length: 50 }),
  tokensIn: integer('tokens_in').default(0),
  tokensOut: integer('tokens_out').default(0),
  latencyMs: integer('latency_ms'),
  fallbackUsed: boolean('fallback_used').notNull().default(false),
  outcome: varchar('outcome', { length: 20 }),
    // 'ready_to_file' | 'answer' | 'duplicate' | 'needs_info'
  resultedInFeedbackId: uuid('resulted_in_feedback_id').references(() => feedback.id, { onDelete: 'set null' }),
  shouldHaveBeenFiled: boolean('should_have_been_filed'),  // backfilled label for deflection quality
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  outcomeResolvedAt: timestamp('outcome_resolved_at', { withTimezone: true }),
});

// ============================================================
// agent_runs — audit trail of every propose-and-approve agent run
// Mirrors Signal migration 016 debug_agent_runs + Contract v1.0 §3.2,
// adapted to propose-and-approve (items routed to pm_review, never
// auto-merged). The run id is a human-readable slug:
//   debug-agent-template-YYYY-MM-DD-HHMM
// ============================================================
export const agentRuns = pgTable('agent_runs', {
  id: varchar('id', { length: 64 }).primaryKey(),    // run slug (Contract §3.2)
  status: varchar('status', { length: 20 }).notNull().default('running'),
    // 'running' | 'completed' | 'failed' | 'skipped'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  itemsTotal: integer('items_total').notNull().default(0),       // items_fetched/attempted
  itemsFixed: integer('items_fixed').notNull().default(0),       // PRs opened (proposed fixes)
  itemsPmReview: integer('items_pm_review').notNull().default(0),// routed to pm_review (diagnosis only)
  itemsSkipped: integer('items_skipped').notNull().default(0),
  itemsFailed: integer('items_failed').notNull().default(0),
  model: varchar('model', { length: 50 }),
  error: text('error'),                              // failure_reason
  summary: text('summary'),
  runLog: jsonb('run_log'),                          // per-item [{ feedback_id, action, confidence, pr_url? }]
  triggeredBy: varchar('triggered_by', { length: 120 }),         // user name or system
  triggeredAt: timestamp('triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
