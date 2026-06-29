// ============================================================
// DEPARTMENTS SCHEMA
// A curated list of org functions. Replaces the free-text
// `department` field previously typed into each requisition,
// and provides the scope options for the assessment task library
// (a task is either General/all or tied to one department).
// ============================================================

import {
  pgTable, uuid, varchar, text, integer, boolean, timestamp,
} from 'drizzle-orm/pg-core';

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
