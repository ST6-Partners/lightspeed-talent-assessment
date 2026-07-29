// ============================================================
// INTERVIEWER AVAILABILITY
// Self-serve availability an interviewer submits from the intake-approval
// email via a tokenized public page (no login) — mirrors the internal
// candidate express-interest flow. One row per (reqId, email); resubmitting
// updates it in place.
// ============================================================
import { pgTable, uuid, varchar, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const interviewerAvailability = pgTable('interviewer_availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').notNull(),
  email: varchar('email', { length: 300 }).notNull(),
  name: varchar('name', { length: 200 }),
  // Array of { date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM' }.
  windows: jsonb('windows').$type<{ date: string; start: string; end: string }[]>(),
  note: text('note'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  reqEmailIdx: uniqueIndex('interviewer_availability_req_email_idx').on(t.reqId, t.email),
}));
