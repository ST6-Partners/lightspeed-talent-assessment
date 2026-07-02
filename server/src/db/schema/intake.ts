// ============================================================
// INTAKE FORM SCHEMA (migration 0019)
// Child tables of job_requisitions: interview_plan, hiring_team,
// awareness_list, approvals.
// ============================================================

import { pgTable, uuid, varchar, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { jobRequisitions } from './hiring.js';

export const interviewPlan = pgTable('interview_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'cascade' }).notNull(),
  roundName: varchar('round_name', { length: 120 }).notNull(),
  lengthMin: integer('length_min'),
  format: varchar('format', { length: 60 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hiringTeam = pgTable('hiring_team', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'cascade' }).notNull(),
  personRef: varchar('person_ref', { length: 200 }).notNull(),
  roleInProcess: varchar('role_in_process', { length: 120 }),
  roundRef: varchar('round_ref', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const awarenessList = pgTable('awareness_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'cascade' }).notNull(),
  personRef: varchar('person_ref', { length: 200 }).notNull(),
  source: varchar('source', { length: 20 }).notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'cascade' }).notNull(),
  step: integer('step').notNull(),
  approverRef: varchar('approver_ref', { length: 200 }),
  approverRole: varchar('approver_role', { length: 40 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  note: text('note'),
  actedAt: timestamp('acted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const interviewQuestions = pgTable('interview_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'cascade' }).notNull(),
  questions: jsonb('questions').default([]).notNull(),
  source: varchar('source', { length: 20 }).notNull().default('standard'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
