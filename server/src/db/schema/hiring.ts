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
  date,
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
  // ── Intake form fields (migration 0019) ──
  reasonType: varchar('reason_type', { length: 40 }),
  roleChangeNote: text('role_change_note'),
  workArrangement: varchar('work_arrangement', { length: 20 }).default('On-site'),
  hybridDays: integer('hybrid_days'),
  compBasis: jsonb('comp_basis').default([]),
  variableComp: text('variable_comp'),
  financeConfirmed: boolean('finance_confirmed').notNull().default(false),
  interviewRounds: integer('interview_rounds').default(1),
  questionSource: varchar('question_source', { length: 20 }).default('standard'),
  teamAvailabilityConfirmed: boolean('team_availability_confirmed').notNull().default(false),
  timelineTemplate: varchar('timeline_template', { length: 20 }).default('standard'),
  targetPostDate: date('target_post_date'),
  targetOfferDate: date('target_offer_date'),
  approvalMode: varchar('approval_mode', { length: 20 }).notNull().default('explicit'),
  baseJdId: uuid('base_jd_id'),
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
  // Array of selected Lightspeed company value names for EPP matching
  eppValues: jsonb('epp_values').default([]),
  workSampleInstructions: text('work_sample_instructions'),
  // Which Work Sample library task this job uses (FK enforced in migration 0017)
  workSampleTaskId: uuid('work_sample_task_id'),
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
  // Work-sample submission (candidate self-submits via emailed link)
  workSampleToken: varchar('work_sample_token', { length: 64 }),
  workSampleSubmission: text('work_sample_submission'),
  workSampleLink: text('work_sample_link'),
  workSampleSubmittedAt: timestamp('work_sample_submitted_at', { withTimezone: true }),
  workSampleNotes: text('work_sample_notes'),
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
  // Internal-candidate handling
  isInternal: boolean('is_internal').notNull().default(false),
  managerAware: boolean('manager_aware').notNull().default(false),
  internalEmployee: varchar('internal_employee', { length: 200 }),
  leadershipAwareness: text('leadership_awareness'),
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


// ── candidate_references (candidate-provided references + responses) ──
export const candidateReferences = pgTable('candidate_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 300 }).notNull(),
  relationship: varchar('relationship', { length: 200 }),
  token: varchar('token', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | requested | responded
  requestedAt: timestamp('requested_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  response: text('response'),
  wouldRehire: varchar('would_rehire', { length: 20 }), // yes | no | unsure
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
