-- Recruiter-first phone-screen scheduling: recruiter submits availability via a
-- tokenized link; the candidate is then emailed that window to confirm or decline.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_recruiter_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_availability" text;
