-- Dedicated self-booking fields for the live work-sample walkthrough, so a
-- walkthrough booking has its own token and is never mistaken for an interview
-- booking by the Calendly webhook (which would otherwise move the candidate to
-- 'Interview Scheduled'). Mirrors the interview_* / phone_screen_* booking columns.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_booking_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_booking_opened_at" timestamptz;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_scheduled_at" timestamptz;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_join_url" text;
