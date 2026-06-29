// ============================================================
// EPP SCHEMA — Criteria Corp Employee Personality Profile
// candidate_epp_scores: one row per candidate per trait (percentile 0–100)
// The 12 EPP traits: Achievement, Assertiveness, Competitiveness,
// Conscientiousness, Cooperativeness, Extroversion, Managerial,
// Motivation, Openness, Patience, Self-Confidence, Stress Tolerance.
// ============================================================

import { pgTable, uuid, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';

export const candidateEppScores = pgTable('candidate_epp_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  trait: varchar('trait', { length: 60 }).notNull(),
  percentile: integer('percentile').notNull(), // 0–100, vs global norm group
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCandidateTrait: unique('uniq_candidate_trait').on(t.candidateId, t.trait),
}));
