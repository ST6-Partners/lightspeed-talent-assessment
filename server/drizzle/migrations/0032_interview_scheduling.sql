-- 0030 Interview scheduling via Calendly.
-- Candidate self-books through a Calendly link; a Calendly webhook records the
-- booked time, join URL, and event refs back onto the candidate.
-- Idempotent (IF NOT EXISTS) so a re-run on an already-migrated DB is safe.

ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_booking_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_booking_opened_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "calendly_scheduling_url" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_scheduled_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_join_url" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "calendly_event_uri" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "calendly_cancel_url" text;
