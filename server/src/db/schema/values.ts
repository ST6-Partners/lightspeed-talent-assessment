// ============================================================
// COMPANY VALUES SCHEMA
// Tables: company_values (the scoreable value framework),
//         candidate_value_scores (per-candidate 1–5 ratings)
// ============================================================

import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean, timestamp, jsonb, unique,
} from 'drizzle-orm/pg-core';
import { users } from './core.js';
import { candidates } from './hiring.js';

// The Lightspeed Way pillars
export const valuePillarEnum = pgEnum('value_pillar', [
  'Mission-Driven',
  'Customer-Obsessed',
  'Results-Focused',
]);

// ── company_values ─────────────────────────────────────────
export const companyValues = pgTable('company_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  pillar: valuePillarEnum('pillar').notNull(),
  // Operating-value grouping (Approach to our work / Team dynamics / Individual practice)
  category: varchar('category', { length: 100 }),
  description: text('description'),
  // EPP/Big-Five dimensions this value maps to (for auto-scoring alignment)
  eppDimensions: jsonb('epp_dimensions').default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── candidate_value_scores ─────────────────────────────────
export const candidateValueScores = pgTable('candidate_value_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  valueId: uuid('value_id')
    .references(() => companyValues.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(), // 1–5
  notes: text('notes'),
  scoredBy: uuid('scored_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCandidateValue: unique('uniq_candidate_value').on(t.candidateId, t.valueId),
}));
