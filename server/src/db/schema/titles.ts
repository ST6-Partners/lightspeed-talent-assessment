// ============================================================
// TITLES — Core Data master list of job titles / levels
// ============================================================
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const titles = pgTable('titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  level: varchar('level', { length: 50 }),
  department: varchar('department', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
