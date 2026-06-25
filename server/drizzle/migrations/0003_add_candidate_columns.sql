-- Adds candidate columns present in schema (hiring.ts) but missing from
-- 0001/0002 migrations: interview, assessment, and notes fields.
-- Idempotent (IF NOT EXISTS) so it is safe across environments.
ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "resume_review_notes" text,
  ADD COLUMN IF NOT EXISTS "reference_check_notes" text,
  ADD COLUMN IF NOT EXISTS "values_match_notes" text,
  ADD COLUMN IF NOT EXISTS "assessment_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "assessment_completed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "interviewer_email" varchar(300),
  ADD COLUMN IF NOT EXISTS "interview_questions" jsonb,
  ADD COLUMN IF NOT EXISTS "interview_transcript" text,
  ADD COLUMN IF NOT EXISTS "interview_feedback_hr" text,
  ADD COLUMN IF NOT EXISTS "interview_feedback_candidate" text,
  ADD COLUMN IF NOT EXISTS "interview_score" integer;
