// ============================================================
// AUDIT TABLES — change_log + change_batches (SC-012)
// Immutable change trail. Per-field tracking.
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { users } from './core.js';

export const changeLog = pgTable('change_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  entityId: uuid('entity_id'),
  entityType: varchar('entity_type', { length: 100 }),
  action: varchar('action', { length: 20 }).notNull(),
    // 'create' | 'update' | 'archive' | 'delete'
  field: varchar('field', { length: 100 }),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  batchId: uuid('batch_id'), // FK → change_batches
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const changeBatches = pgTable('change_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 500 }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  sourceType: varchar('source_type', { length: 30 }).notNull(),
    // 'claude_batch' | 'csv_import' | 'manual' | 'batch_auto'
  status: varchar('status', { length: 20 }).notNull().default('draft'),
    // 'draft' | 'applied' | 'reverted'
  changeCount: integer('change_count').notNull().default(0),
  changesJson: jsonb('changes_json'),
  previewJson: jsonb('preview_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
