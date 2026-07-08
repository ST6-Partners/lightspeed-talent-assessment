// ============================================================
// EMPLOYEES — internal staff who can act as value reviewers
// ============================================================
import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  title: varchar('title', { length: 200 }),
  email: varchar('email', { length: 300 }),
  managerEmail: varchar('manager_email', { length: 300 }), // who this person reports to (walks the leadership chain)
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
