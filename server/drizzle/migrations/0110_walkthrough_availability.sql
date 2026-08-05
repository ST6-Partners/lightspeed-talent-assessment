-- Recruiter-first scheduling for the work-sample LIVE WALKTHROUGH (mirrors the
-- phone-screen flow): the recruiter offers date/time windows, the candidate picks
-- one, no Calendly required. These columns hold the offered windows, the formatted
-- text, the candidate's pick, and the parsed end time (for the decision reminder).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_slots" jsonb;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_availability" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_selected_slot" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_end_at" timestamp with time zone;
