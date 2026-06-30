// ============================================================
// EMPLOYEES — internal staff who can act as value reviewers
// ============================================================
import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  title: varchar('title', { length: 200 }),
  email: varchar('email', { length: 300 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
