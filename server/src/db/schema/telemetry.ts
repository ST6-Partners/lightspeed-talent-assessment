// ============================================================
// TELEMETRY TABLES — user activity + chat debug + chat logs + satisfaction (SC-003)
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './core.js';

export const userActivityLog = pgTable('user_activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  eventType: varchar('event_type', { length: 100 }).notNull(),
    // 'screen_visit' | 'feature_action' | 'search' | etc.
  eventValue: varchar('event_value', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatDebugLog = pgTable('chat_debug_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  promptTemplateId: uuid('prompt_template_id'),
  sessionId: varchar('session_id', { length: 100 }),
  conversationId: uuid('conversation_id'),
  turnNumber: integer('turn_number'),
  userReaction: varchar('user_reaction', { length: 50 }),
    // 'thumbs_up' | 'thumbs_down' | null
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  toolCalls: integer('tool_calls'),
  loopCount: integer('loop_count'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Chat session logs — captures initial prompt per chat session (RCDO pattern)
export const chatSessionLogs = pgTable('chat_session_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  initialPrompt: text('initial_prompt').notNull(),
  screenMode: varchar('screen_mode', { length: 100 }),
    // e.g. 'dashboard' | 'settings' | 'entity_detail' — the screen context
  screenTab: varchar('screen_tab', { length: 100 }),
    // sub-tab or section within the screen
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
