// ============================================================
// CAPABILITY SCHEMA — the "Capability" scorecard section
// capability_items            — the scoreable capability categories (rolled up
//                               from PA1's non-Values HDS categories) with a
//                               teachability code on each
// candidate_capability_scores — per-item 1–5 score, belongs to a value_review
//                               (reuses value_reviews as the per-reviewer container)
// ============================================================

import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean, timestamp, unique,
} from 'drizzle-orm/pg-core';
import { valueReviews } from './values.js';

// How hard is this capability to teach once the person is hired?
// Drives how heavily a gap counts against a candidate.
export const teachabilityEnum = pgEnum('teachability', [
  'hard_to_teach',
  'compound',
  'learnable',
]);

export const capabilityItems = pgTable('capability_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  teachability: teachabilityEnum('teachability').notNull().default('compound'),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqName: unique('uniq_capability_item_name').on(t.name),
}));

// candidate_capability_scores — one capability score within a review
export const candidateCapabilityScores = pgTable('candidate_capability_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .references(() => valueReviews.id, { onDelete: 'cascade' })
    .notNull(),
  capabilityItemId: uuid('capability_item_id')
    .references(() => capabilityItems.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(), // 1-5
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqReviewItem: unique('uniq_review_capability_item').on(t.reviewId, t.capabilityItemId),
}));
