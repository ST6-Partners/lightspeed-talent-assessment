// ============================================================
// OFFER APPROVALS SCHEMA
// A hiring-manager sign-off gate that sits BEFORE the offer letter
// goes to the candidate. The recruiter sends a drafted offer here;
// it lands in the manager's inbox; the manager reviews, edits, and
// then either signs off (which delivers the letter to the candidate)
// or sends it back. The row `id` doubles as the tokenized review link
// (same pattern as intake `approvals`).
// ============================================================

import { pgTable, uuid, varchar, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';
import { users } from './core.js';

export const offerApprovals = pgTable('offer_approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  // Snapshot of the OfferLetterInput (title, comp, variableComp, dates,
  // location, legalClauses, addendum, ...). Editable by the manager.
  payload: jsonb('payload').notNull(),
  // pending | approved | sent_back
  // external | internal (which letter renderer + delivery path applies)
  kind: varchar('kind', { length: 20 }).notNull().default('external'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  managerName: varchar('manager_name', { length: 200 }),
  managerNote: text('manager_note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  sentToCandidateAt: timestamp('sent_to_candidate_at', { withTimezone: true }),
  // Multi-level approval chain (migration 0050). Ordered list of approver
  // steps the offer routes through: the hiring manager, then each manager
  // above them in the reporting line (employees.managerEmail). Each step:
  //   { order:number, name:string, email:string,
  //     status:'pending'|'approved'|'sent_back',
  //     actedName?:string, note?:string, decidedAt?:string }
  // Empty [] = legacy single-manager gate (pre-0050 behavior).
  chain: jsonb('chain').notNull().default([]),
  // Index into `chain` of the approver whose sign-off is currently awaited.
  currentStep: integer('current_step').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
