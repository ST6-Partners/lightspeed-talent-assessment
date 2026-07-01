// ============================================================
// ASSESSMENT PACKAGES SCHEMA
// A "package" (assignment) is what a candidate actually receives:
// a stored pairing of ONE General baseline task + ONE function-
// specific task. Routing: a package targets a department, so the
// role a candidate applied for selects the package.
// ============================================================

import {
  pgTable, uuid, varchar, integer, boolean, timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './core.js';
import { departments } from './departments.js';
import { assessmentTasks, taskStatusEnum } from './assessmentTasks.js';

export const assessmentPackages = pgTable('assessment_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 300 }).notNull(),
  // The function this assignment is for (drives routing). NULL = generic/unscoped.
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  // The pairing: one General baseline task + one functional task.
  generalTaskId: uuid('general_task_id').references(() => assessmentTasks.id, { onDelete: 'set null' }),
  functionalTaskId: uuid('functional_task_id').references(() => assessmentTasks.id, { onDelete: 'set null' }),
  status: taskStatusEnum('status').notNull().default('Draft'),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  // Delivery settings: how the candidate receives/starts the assessment.
  // 'scheduled' = unlocks at a set time; 'open' = start any time.
  // windowMinutes = the timed window to complete once started.
  deliveryMode: varchar('delivery_mode', { length: 20 }).notNull().default('scheduled'),
  windowMinutes: integer('window_minutes').notNull().default(90),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
