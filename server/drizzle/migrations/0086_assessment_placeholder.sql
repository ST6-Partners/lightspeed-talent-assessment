-- Placeholder (no-CCAT-key) assessment: a candidate-facing link that shows one
-- work-sample question and captures a REAL submission, replacing the randomly
-- simulated CCAT data used while CRITERIA_API_KEY is unset.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "assessment_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "assessment_submission" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "assessment_task_id" uuid;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "assessment_submitted_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "assessment_notes" text;
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_assessment_token_idx" ON "candidates" ("assessment_token");
