// ============================================================
// COMPANY VALUES SCHEMA
// company_values  — the scoreable value framework
// value_reviews   — one review = one reviewer scoring one candidate on a date
// candidate_value_scores — per-value 1–5 score, belongs to a review
// (one candidate → many reviews → many value scores)
// ============================================================

import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean, timestamp, jsonb, unique,
} from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';
import { employees } from './employees.js';

export const valuePillarEnum = pgEnum('value_pillar', [
  'Mission-Driven',
  'Customer-Obsessed',
  'Results-Focused',
]);

export const companyValues = pgTable('company_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  pillar: valuePillarEnum('pillar').notNull(),
  category: varchar('category', { length: 100 }),
  description: text('description'),
  eppDimensions: jsonb('epp_dimensions').default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── value_reviews — a reviewer's dated scoring pass on a candidate ──
export const valueReviews = pgTable('value_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  reviewerId: uuid('reviewer_id').references(() => employees.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── candidate_value_scores — one value score within a review ──
export const candidateValueScores = pgTable('candidate_value_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .references(() => valueReviews.id, { onDelete: 'cascade' })
    .notNull(),
  valueId: uuid('value_id')
    .references(() => companyValues.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(), // 1–5
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqReviewValue: unique('uniq_review_value').on(t.reviewId, t.valueId),
}));
