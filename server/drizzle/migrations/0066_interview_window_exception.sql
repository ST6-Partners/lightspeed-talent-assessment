-- Per-candidate exception to the 48-business-hour interview scheduling window
-- (used when an interviewer or the candidate isn't available inside the window).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_window_exception" boolean DEFAULT false NOT NULL;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_window_exception_note" text;
