// ============================================================
// HIRING PIPELINE SCHEMA
// Tables: job_requisitions, job_descriptions, candidates,
//         candidate_stage_history, email_log
// ============================================================

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './core.js';

// ── Enums ──────────────────────────────────────────────────

export const candidateStageEnum = pgEnum('candidate_stage', [
  'Applied',
  'Assessment',
  'Work Sample',
  'Values Review',
  'Interview Scheduled',
  'Interviewed',
  'Offered',
  'Hired',
  'Rejected',
]);

export const requisitionStatusEnum = pgEnum('requisition_status', [
  'Draft',
  'Pending Approval',
  'Approved',
  'Open',
  'On Hold',
  'Closed',
]);

export const jdStatusEnum = pgEnum('jd_status', ['Draft', 'Published', 'Closed']);

export const emailStatusEnum = pgEnum('email_status', ['pending', 'sent', 'failed']);

// ── job_requisitions ───────────────────────────────────────

export const jobRequisitions = pgTable('job_requisitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  department: varchar('department', { length: 200 }).notNull(),
  hiringManager: varchar('hiring_manager', { length: 200 }).notNull(),
  numOpenings: integer('num_openings').notNull().default(1),
  employmentType: varchar('employment_type', { length: 50 }).notNull().default('Full-Time'),
  location: varchar('location', { length: 200 }),
  remote: boolean('remote').notNull().default(false),
  targetStartDate: timestamp('target_start_date', { withTimezone: true }),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  reason: text('reason'),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'),
  status: requisitionStatusEnum('status').notNull().default('Draft'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── job_descriptions ───────────────────────────────────────

export const jobDescriptions = pgTable('job_descriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reqId: uuid('req_id')
    .references(() => jobRequisitions.id, { onDelete: 'cascade' })
    .notNull(),
  jobTitle: varchar('job_title', { length: 300 }).notNull(),
  summary: text('summary'),
  responsibilities: text('responsibilities'),
  requiredQualifications: text('required_qualifications'),
  preferredQualifications: text('preferred_qualifications'),
  ccatThreshold: integer('ccat_threshold').notNull().default(30),
  // Array of selected Lightspeed company value names for EPP matching
  eppValues: jsonb('epp_values').default([]),
  workSampleInstructions: text('work_sample_instructions'),
  status: jdStatusEnum('status').notNull().default('Draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── candidates ─────────────────────────────────────────────

export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  jdId: uuid('jd_id').references(() => jobDescriptions.id, { onDelete: 'set null' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 300 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  linkedinUrl: text('linkedin_url'),
  resumeUrl: text('resume_url'),
  source: varchar('source', { length: 100 }),
  currentStage: candidateStageEnum('current_stage').notNull().default('Applied'),
  rejectionReason: text('rejection_reason'),
  // Criteria Corp identifiers
  criteriaCorpId: varchar('criteria_corp_id', { length: 100 }),
  ccatScore: integer('ccat_score'),
  eppProfile: jsonb('epp_profile'),
  eppValuesMatchScore: integer('epp_values_match_score'),
  // Automated scoring fields
  workSampleScore: integer('work_sample_score'),
  resumeReviewScore: integer('resume_review_score'),
  referenceCheckScore: integer('reference_check_score'),
  // Work sample + resume + reference check notes
  resumeReviewNotes: text('resume_review_notes'),
  referenceCheckNotes: text('reference_check_notes'),
  valuesMatchNotes: text('values_match_notes'),
  // Assessment timing (for reminder + auto-reject scheduler)
  assessmentSentAt: timestamp('assessment_sent_at', { withTimezone: true }),
  assessmentCompletedAt: timestamp('assessment_completed_at', { withTimezone: true }),
  // Interview
  interviewerName: varchar('interviewer_name', { length: 200 }),
  interviewerEmail: varchar('interviewer_email', { length: 300 }),
  zoomMeetingId: varchar('zoom_meeting_id', { length: 100 }),
  // AI-generated interview content
  interviewQuestions: jsonb('interview_questions'),
  interviewTranscript: text('interview_transcript'),
  interviewFeedbackHr: text('interview_feedback_hr'),
  interviewFeedbackCandidate: text('interview_feedback_candidate'),
  interviewScore: integer('interview_score'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── candidate_stage_history ────────────────────────────────

export const candidateStageHistory = pgTable('candidate_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  fromStage: candidateStageEnum('from_stage'),
  toStage: candidateStageEnum('to_stage').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── email_log ──────────────────────────────────────────────

export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  recipient: varchar('recipient', { length: 300 }).notNull(),
  template: varchar('template', { length: 100 }).notNull(),
  subject: varchar('subject', { length: 500 }),
  status: emailStatusEnum('status').notNull().default('pending'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
