// ============================================================
// ASSESSMENT TASKS SCHEMA (work-product / AI-skill task library)
// One curated, stored task = the atomic unit a candidate is given.
// Scope: departmentId NULL = General (everyone, baseline problem-
// solving + AI fluency); a departmentId = a function-specific task.
// A single task measures BOTH work quality and AI skill — hence the
// two separate scoring guides.
// ============================================================

import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean, timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './core.js';
import { departments } from './departments.js';

export const taskDifficultyEnum = pgEnum('task_difficulty', ['Entry', 'Mid', 'Senior']);

export const taskStatusEnum = pgEnum('task_status', ['Draft', 'In Review', 'Live', 'Retired']);

export const assessmentTasks = pgTable('assessment_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 300 }).notNull(),
  // NULL departmentId = General (given to everyone). Otherwise scoped to one function.
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  difficulty: taskDifficultyEnum('difficulty').notNull().default('Mid'),
  timeLimitMin: integer('time_limit_min'),
  // What the candidate sees
  brief: text('brief'),
  showYourWorkInstructions: text('show_your_work_instructions'),
  // Two scoring guides — graded separately so one task yields two marks
  scoringGuideWork: text('scoring_guide_work'),
  scoringGuideAi: text('scoring_guide_ai'),
  status: taskStatusEnum('status').notNull().default('Draft'),
  // How the candidate completes this task:
  //  'take_home'       — emailed link, candidate submits a written answer/file (auto-scored)
  //  'live_walkthrough' — a Zoom interview round where the candidate walks the panel through it (human-scored)
  deliveryMode: varchar('delivery_mode', { length: 20 }).notNull().default('take_home'),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
