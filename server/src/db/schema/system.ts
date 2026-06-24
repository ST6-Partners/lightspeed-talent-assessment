// ============================================================
// SYSTEM OPERATIONS TABLES — jobs, backups, onboarding videos
// (Design Plan sections 3l, 3m, 3p)
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, bigint } from 'drizzle-orm/pg-core';
import { users } from './core.js';

export const systemJobs = pgTable('system_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: varchar('job_name', { length: 255 }).notNull(),
  jobType: varchar('job_type', { length: 20 }).notNull(),
    // 'cron' | 'agent' | 'manual'
  status: varchar('status', { length: 20 }).notNull().default('running'),
    // 'running' | 'success' | 'fail' | 'timeout'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  initiatedBy: uuid('initiated_by').references(() => users.id),
  output: jsonb('output'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const backupLog = pgTable('backup_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemJobId: uuid('system_job_id').references(() => systemJobs.id),
  backupType: varchar('backup_type', { length: 20 }).notNull(),
    // 'full' | 'selective'
  tablesIncluded: text('tables_included'), // Comma-separated; null = all
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  filePath: varchar('file_path', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull(),
  initiatedBy: uuid('initiated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const onboardingVideos = pgTable('onboarding_videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  url: varchar('url', { length: 1000 }).notNull(),
  category: varchar('category', { length: 100 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
