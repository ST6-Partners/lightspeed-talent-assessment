ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_window_start" timestamptz;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "interview_window_end" timestamptz;
