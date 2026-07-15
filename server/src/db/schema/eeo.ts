// ============================================================
// EEO STORE — voluntary self-identification (adverse-impact monitoring)
//
// This table is DELIBERATELY WALLED OFF from the candidate
// evaluation path. Nothing that scores, screens, ranks, or
// advances/rejects a candidate may import or read this table.
// It exists for ONE purpose: aggregate adverse-impact reporting
// (the four-fifths audit). Data is candidate-supplied, voluntary,
// and every field allows "Declined".
//
// The wall: the only readers of `eeoResponses` are the EEO router
// (invite + public survey) and the adverse-impact audit service.
// A grep test in CI/verify proves no scoring/ranking/ai module
// imports this file.
// ============================================================

import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';

// One row per candidate. Created as an 'invited' shell (token only,
// answers null) when a survey link is generated; flipped to
// 'completed' or 'declined' when the candidate responds. Answer
// columns hold a category string or the literal 'Declined'.
export const eeoResponses = pgTable('eeo_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),

  // Tokenized public link (like the work-sample token). Not sensitive.
  token: varchar('token', { length: 64 }).notNull(),

  // 'invited' | 'completed' | 'declined'
  status: varchar('status', { length: 20 }).notNull().default('invited'),

  // Voluntary self-ID answers. Null = not answered; 'Declined' = the
  // candidate explicitly chose "prefer not to say" for that field.
  sex: varchar('sex', { length: 40 }),
  raceEthnicity: varchar('race_ethnicity', { length: 80 }),
  veteranStatus: varchar('veteran_status', { length: 40 }),
  disabilityStatus: varchar('disability_status', { length: 40 }),

  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
