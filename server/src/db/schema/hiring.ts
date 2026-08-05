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
  // Declaration order IS the funnel order (matched to the DB by migration 0061).
  'Applied',
  'Assessment',
  'Candidate Review',
  'Work Sample',
  // Human recruiter phone screen (logistics + fit) before the interview loop.
  'Phone Screen',
  'Interview',
  // Reference Check follows the (optional, per-role) Work Sample, before an offer.
  'Reference Check',
  // The offer step: reached when reference checks clear. Sending the actual
  // offer letter is the follow-on action, so present-tense "Offer" reads right.
  'Offer',
  'Hired',
  'Rejected',
  // Terminal disposition for candidates whose role closed/filled. NOT an
  // individual rejection — kept separate from 'Rejected' for clean reporting.
  'Not Selected',
]);

export const requisitionStatusEnum = pgEnum('requisition_status', [
  'Draft',
  'Pending Approval',
  'Approved',
  'Open',
  'On Hold',
  'Closed',
  'Rejected',
  'Changes Requested',
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
  roleTitle: varchar('role_title', { length: 200 }),
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
  // Intake-time answer to "should this role have a work sample step?" -- only
  // meaningful for the non-backfill reasons (a new JD gets generated); applied
  // to the new job_descriptions row's own workSampleRequired at approval time.
  workSampleRequired: boolean('work_sample_required').notNull().default(true),
  approvalPlan: jsonb('approval_plan').default([]),
  // ── Role profile & search criteria (migration 0030 — Jody feedback) ──
  mustHaves: text('must_haves'),
  niceToHaves: text('nice_to_haves'),
  standoutSignals: text('standout_signals'),
  dealbreakers: text('dealbreakers'),
  thriveProfile: text('thrive_profile'),
  struggleProfile: text('struggle_profile'),
  teamContext: text('team_context'),
  targetCompanies: text('target_companies'),
  avoidCompanies: text('avoid_companies'),
  internalReferrals: text('internal_referrals'),
  // ── Known constraints (ELT / Finance / HR) ──
  knownConstraints: text('known_constraints'),
  constraintsAck: boolean('constraints_ack').notNull().default(false),
  status: requisitionStatusEnum('status').notNull().default('Draft'),
  // Internal-first posting window anchor (set when the role goes Open) + external-open stamp.
  postedAt: timestamp('posted_at', { withTimezone: true }),
  externalOpenedAt: timestamp('external_opened_at', { withTimezone: true }),
  // Auto internal-announce stamp: set the first time the role opens so it announces once (replaces manual megaphone).
  internalAnnouncedAt: timestamp('internal_announced_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── job_descriptions ───────────────────────────────────────

export const jobDescriptions = pgTable('job_descriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // A JD is reusable library content. It MAY still carry the legacy req_id
  // (the 1:1 era); new JDs stand alone and are linked FROM a requisition via
  // job_requisitions.base_jd_id. Deleting a req now detaches the JD (set null)
  // instead of destroying it.
  reqId: uuid('req_id')
    .references(() => jobRequisitions.id, { onDelete: 'set null' }),
  department: varchar('department', { length: 200 }),
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
  // Optional per role: when true, this role includes a Work Sample step (after
  // the team interview). Default false — work sample is no longer automatic.
  workSampleRequired: boolean('work_sample_required').notNull().default(false),
  // Placeholder work-sample upload (per JD). Actual work-sample task content is
  // tabled; each role can attach an uploaded work sample file instead of a
  // library task. Stored as an /api/files/... URL + original filename.
  workSampleUploadUrl: text('work_sample_upload_url'),
  workSampleUploadName: text('work_sample_upload_name'),
  status: jdStatusEnum('status').notNull().default('Draft'),
  // Intake-generated JD awaiting hiring-manager review (NEW JD for review)
  pendingReview: boolean('pending_review').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── candidates ─────────────────────────────────────────────

export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  jdId: uuid('jd_id').references(() => jobDescriptions.id, { onDelete: 'set null' }),
  // The requisition (opening) this candidate applied to. A JD can be reused
  // across requisitions, so candidate scoping follows req_id, not the shared JD.
  reqId: uuid('req_id').references(() => jobRequisitions.id, { onDelete: 'set null' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 300 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  linkedinUrl: text('linkedin_url'),
  resumeUrl: text('resume_url'),
  resumeText: text('resume_text'),
  source: varchar('source', { length: 100 }),
  currentStage: candidateStageEnum('current_stage').notNull().default('Applied'),
  rejectionReason: text('rejection_reason'),
  // Delayed-send "undo window" for the manual rejection email. On a manual reject
  // we stamp this to now + 2 min instead of emailing immediately; the every-minute
  // `send-due-rejection-emails` job sends once it is due (and the candidate is still
  // Rejected), then clears it. Unreject clears it too, cancelling the email.
  rejectionEmailSendAfter: timestamp('rejection_email_send_after', { withTimezone: true }),
  rejectionEmailFromStage: varchar('rejection_email_from_stage', { length: 50 }),
  // Hard cutoff: Criteria Corp flagged this CCAT/EPP submission as an invalid
  // result (validity/consistency check failure -- shows as a red "Warning:
  // Invalid Result" banner on the Criteria score report). Overrides the score
  // threshold -- the assessment gate auto-rejects regardless of ccatScore.
  ccatInvalidResult: boolean('ccat_invalid_result').notNull().default(false),
  // Criteria Corp identifiers
  criteriaCorpId: varchar('criteria_corp_id', { length: 100 }),
  ccatScore: integer('ccat_score'),
  // CCAT percentile + sub-area breakdown (Criteria reports Verbal, Math & Logic,
  // Spatial Reasoning). Populated from Criteria's response; null until the
  // assessment is completed and scores are pulled.
  ccatPercentile: integer('ccat_percentile'),
  ccatVerbal: integer('ccat_verbal'),
  ccatMathLogic: integer('ccat_math_logic'),
  ccatSpatial: integer('ccat_spatial'),
  eppProfile: jsonb('epp_profile'),
  eppValuesMatchScore: integer('epp_values_match_score'),
  // Automated scoring fields
  workSampleScore: integer('work_sample_score'),
  // Work-sample submission (candidate self-submits via emailed link)
  workSampleToken: varchar('work_sample_token', { length: 64 }),
  workSampleSubmission: text('work_sample_submission'),
  // multi_select work samples: the exact options the candidate ticked (auto-graded).
  workSampleSelections: jsonb('work_sample_selections').$type<string[]>(),
  workSampleLink: text('work_sample_link'),
  workSampleSubmittedAt: timestamp('work_sample_submitted_at', { withTimezone: true }),
  workSampleNotes: text('work_sample_notes'),
  resumeReviewScore: integer('resume_review_score'),
  // Work sample + resume notes
  resumeReviewNotes: text('resume_review_notes'),
  resumeRequirementChecks: jsonb('resume_requirement_checks').$type<{ requirement: string; met: boolean; evidence?: string }[]>(),
  valuesMatchNotes: text('values_match_notes'),
  // Combined screen (resume + values + skills) — one automated screen result
  skillsFitScore: integer('skills_fit_score'),
  skillsFitNotes: text('skills_fit_notes'),
  screenScore: integer('screen_score'),
  screenRecommendation: text('screen_recommendation'),
  // How many times the candidate has been flagged for human review (any gate).
  reviewFlagCount: integer('review_flag_count').notNull().default(0),
  screenSummary: text('screen_summary'),
  screenedAt: timestamp('screened_at', { withTimezone: true }),
  companyValuesMatchScore: integer('company_values_match_score'),
  companyValuesNotes: text('company_values_notes'),
  // ── Reference check (manual decision gate before the offer) ──
  // The recorder marks the outcome of the candidate's references. 'cleared'
  // promotes to Offer, 'failed' rejects, 'concerns' holds in Reference Check.
  // Values are constrained in the tRPC layer (see candidates.recordReferenceOutcome).
  referenceOutcome: text('reference_outcome'),
  referenceNotes: text('reference_notes'),
  referenceDecidedAt: timestamp('reference_decided_at', { withTimezone: true }),
  referenceDecidedBy: uuid('reference_decided_by').references(() => users.id, { onDelete: 'set null' }),
  // Assessment timing (for reminder + auto-reject scheduler)
  assessmentSentAt: timestamp('assessment_sent_at', { withTimezone: true }),
  assessmentCompletedAt: timestamp('assessment_completed_at', { withTimezone: true }),
  // ── Placeholder assessment (used when CRITERIA_API_KEY is unset) ──
  // A candidate-facing tokenized link shows one work-sample question and captures
  // a REAL typed submission, replacing the randomly-simulated CCAT data. When the
  // real Criteria key is configured this path is bypassed (criteriaCorpId flow).
  assessmentToken: varchar('assessment_token', { length: 64 }),
  assessmentSubmission: text('assessment_submission'),
  assessmentTaskId: uuid('assessment_task_id'),
  assessmentSubmittedAt: timestamp('assessment_submitted_at', { withTimezone: true }),
  assessmentNotes: text('assessment_notes'),
  // Interview
  interviewerName: varchar('interviewer_name', { length: 200 }),
  interviewerEmail: varchar('interviewer_email', { length: 300 }),
  zoomMeetingId: varchar('zoom_meeting_id', { length: 100 }),
  // Interview scheduling (Calendly self-booking)
  interviewBookingToken: varchar('interview_booking_token', { length: 64 }), // candidate self-book link (our tracking id)
  interviewBookingOpenedAt: timestamp('interview_booking_opened_at', { withTimezone: true }), // window start (for the 48h reminder)
  calendlySchedulingUrl: text('calendly_scheduling_url'),                // interviewer's Calendly event link the candidate books through
  interviewScheduledAt: timestamp('interview_scheduled_at', { withTimezone: true }),           // booked time (from the Calendly webhook)
  interviewJoinUrl: text('interview_join_url'),                          // meeting join link (from Calendly, e.g. Zoom)
  calendlyEventUri: text('calendly_event_uri'),                          // Calendly scheduled_event uri
  calendlyCancelUrl: text('calendly_cancel_url'),                        // Calendly reschedule/cancel link
  // Phone-screen scheduling (a phone-call Calendly event — no video link; recruiter calls the candidate)
  phoneScreenBookingToken: varchar('phone_screen_booking_token', { length: 64 }),
  phoneScreenBookingOpenedAt: timestamp('phone_screen_booking_opened_at', { withTimezone: true }),
  // The REAL call start time, parsed from the slot the candidate confirmed (not the
  // moment they clicked confirm). phoneScreenEndAt is that same slot's end time — the
  // post-call decision reminder fires right at phoneScreenEndAt (e.g. a 3–4pm slot
  // reminds the recruiter at 4pm), falling back to 30 min after phoneScreenScheduledAt
  // for older rows confirmed before phoneScreenEndAt existed.
  phoneScreenScheduledAt: timestamp('phone_screen_scheduled_at', { withTimezone: true }),
  phoneScreenEndAt: timestamp('phone_screen_end_at', { withTimezone: true }),
  // Recruiter-first phone-screen scheduling: the recruiter submits availability
  // via a tokenized link, then the candidate is emailed that window to confirm.
  phoneScreenRecruiterToken: varchar('phone_screen_recruiter_token', { length: 64 }),
  phoneScreenAvailability: text('phone_screen_availability'),
  // Individual proposed slots the candidate chooses from — objects of shape
  // { date, start, end, label } (label is the formatted display string; date/start/end
  // are the raw recruiter-entered values used to compute phoneScreenScheduledAt /
  // phoneScreenEndAt once picked). Rows written before this shape existed may still
  // hold a plain string[] of labels — readers must handle both.
  phoneScreenSlots: jsonb('phone_screen_slots'),
  phoneScreenSelectedSlot: text('phone_screen_selected_slot'),
  // Candidate's counter-proposal slots when none of the recruiter's windows work;
  // the recruiter then picks one of these (mirror of the original flow).
  phoneScreenCandidateSlots: jsonb('phone_screen_candidate_slots'),
  // Work-sample live-walkthrough scheduling (its own booking link so a walkthrough
  // booking is never mistaken for an interview booking by the Calendly webhook).
  workSampleBookingToken: varchar('work_sample_booking_token', { length: 64 }),
  workSampleBookingOpenedAt: timestamp('work_sample_booking_opened_at', { withTimezone: true }),
  workSampleScheduledAt: timestamp('work_sample_scheduled_at', { withTimezone: true }),
  workSampleEndAt: timestamp('work_sample_end_at', { withTimezone: true }),
  workSampleJoinUrl: text('work_sample_join_url'),
  // Recruiter-first walkthrough scheduling (mirrors the phone-screen slots):
  // offered windows [{date,start,end,label}], their formatted text, and the pick.
  workSampleSlots: jsonb('work_sample_slots'),
  workSampleAvailability: text('work_sample_availability'),
  workSampleSelectedSlot: text('work_sample_selected_slot'),
  // AI-generated interview content
  interviewQuestions: jsonb('interview_questions'),
  interviewTranscript: text('interview_transcript'),
  interviewFeedbackHr: text('interview_feedback_hr'),
  interviewFeedbackCandidate: text('interview_feedback_candidate'),
  interviewScore: integer('interview_score'),
  interviewFeedbackInterviewer: text('interview_feedback_interviewer'),
  notes: text('notes'),
  // Interview scheduling window exception (72-business-hour rule bypass when an
  // interviewer or the candidate isn't available inside the window).
  interviewWindowException: boolean('interview_window_exception').notNull().default(false),
  interviewWindowExceptionNote: text('interview_window_exception_note'),
  // Internal-candidate handling
  isInternal: boolean('is_internal').notNull().default(false),
  managerAware: boolean('manager_aware').notNull().default(false),
  internalEmployee: varchar('internal_employee', { length: 200 }),
  leadershipAwareness: text('leadership_awareness'),
  // Offer e-signature. The offer email carries an "Agree & sign" button pointing at
  // /offer-sign/<offerSignToken>. When the candidate signs (in-app, or via Adobe
  // Sign's own flow → webhook), they auto-advance to Hired and the role auto-closes
  // once its openings are filled. offerSignedAt makes completion idempotent.
  offerSignToken: varchar('offer_sign_token', { length: 64 }),
  offerAgreementId: varchar('offer_agreement_id', { length: 128 }),
  offerSignedAt: timestamp('offer_signed_at', { withTimezone: true }),
  // If the candidate declines the offer (the "Decline offer" button next to
  // "Agree & sign"), they are closed out without a company-rejection email.
  offerDeclinedAt: timestamp('offer_declined_at', { withTimezone: true }),
  offerDeclineReason: text('offer_decline_reason'),
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

// ── candidate_references ───────────────────────────────────
// References a candidate provides (captured on the add-candidate form). The
// table already exists in the DB (migration 0023); this models it. `token` +
// `status`/`response`/`wouldRehire`/`requestedAt`/`respondedAt` pre-position a
// future "email the reference for a response" flow — for now we capture the
// reference (name/email/relationship) and default status to 'pending'.
export const candidateReferences = pgTable('candidate_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  email: varchar('email', { length: 300 }).notNull(),
  relationship: varchar('relationship', { length: 200 }),
  token: varchar('token', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  requestedAt: timestamp('requested_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  response: text('response'),
  wouldRehire: varchar('would_rehire', { length: 20 }),
  // Per-reference decision recorded by the recruiter at the Reference Check stage
  // (cleared / concerns / failed), independent of the candidate-level roll-up in
  // candidates.reference_outcome. Allowed values enforced in the tRPC layer.
  outcome: varchar('outcome', { length: 20 }),
  outcomeNotes: text('outcome_notes'),
  outcomeAt: timestamp('outcome_at', { withTimezone: true }),
  outcomeBy: uuid('outcome_by'),
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

// ── candidate ranking (advisory — never auto-advances or rejects) ──
// The AI orders candidates who passed the hard cutoff against the role
// (job description + hiring-manager intake intent). A human decides.

export const rankingRuns = pgTable('ranking_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jdId: uuid('jd_id').references(() => jobDescriptions.id, { onDelete: 'cascade' }).notNull(),
  reqId: uuid('req_id'),
  totalRanked: integer('total_ranked').notNull().default(0),
  criteriaSummary: text('criteria_summary'),
  criteriaText: text('criteria_text'),
  limitedData: boolean('limited_data').notNull().default(false),
  model: varchar('model', { length: 100 }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const candidateRankings = pgTable('candidate_rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => rankingRuns.id, { onDelete: 'cascade' }).notNull(),
  jdId: uuid('jd_id').references(() => jobDescriptions.id, { onDelete: 'cascade' }).notNull(),
  candidateId: uuid('candidate_id').references(() => candidates.id, { onDelete: 'cascade' }).notNull(),
  rank: integer('rank').notNull(),
  sortScore: integer('sort_score').notNull().default(0),
  hadResume: boolean('had_resume').notNull().default(true),
  recommendation: text('recommendation'),
  strengths: jsonb('strengths').default([]),
  concerns: jsonb('concerns').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
