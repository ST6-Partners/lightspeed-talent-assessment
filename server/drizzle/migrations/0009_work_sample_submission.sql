-- Candidate self-submitted work sample (via emailed link) + AI score notes.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_submission" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_link" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_submitted_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_notes" text;
CREATE UNIQUE INDEX IF NOT EXISTS "candidates_work_sample_token_idx" ON "candidates" ("work_sample_token");
