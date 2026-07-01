// ============================================================
// ASSESSMENT SESSIONS SCHEMA
// A "session" is a single scheduled, timed take-home assessment
// delivery to one candidate. The candidate accesses it via a
// unique token (unauthenticated), starts it (opening a timed
// window), and submits responses before the window closes.
// ============================================================

import {
  pgTable, pgEnum, uuid, varchar, text, integer, timestamp,
} from 'drizzle-orm/pg-core';
import { assessmentPackages } from './assessmentPackages.js';
import { candidates } from './hiring.js';

export const sessionStatusEnum = pgEnum('session_status', [
  'scheduled', 'in_progress', 'submitted', 'expired',
]);

export const assessmentSessions = pgTable('assessment_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packageId: uuid('package_id').references(() => assessmentPackages.id, { onDelete: 'set null' }),
  candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'set null' }),
  candidateEmail: varchar('candidate_email', { length: 300 }).notNull(),
  // Unique access token — the candidate's unauthenticated key to the session.
  token: varchar('token', { length: 64 }).notNull().unique(),
  // scheduledStart: when a 'scheduled' delivery unlocks. dueAt: computed at
  // start = startedAt + windowMinutes.
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  status: sessionStatusEnum('status').notNull().default('scheduled'),
  // Candidate submissions (one response + show-your-work per task).
  generalResponse: text('general_response'),
  generalShowWork: text('general_show_work'),
  functionalResponse: text('functional_response'),
  functionalShowWork: text('functional_show_work'),
  // Scoring (admin/AI side — never returned to the candidate).
  workScore: integer('work_score'),
  aiScore: integer('ai_score'),
  scoreRationale: text('score_rationale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
