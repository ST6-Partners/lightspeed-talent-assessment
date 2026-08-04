-- 0097 — per-round day-before reminder guard. Set when the interviewer's
-- "your interview is tomorrow" bell notification has been created for a round,
-- so the scheduler fires it exactly once per round. Idempotent.
ALTER TABLE "candidate_interviews" ADD COLUMN IF NOT EXISTS "reminder_notified_at" timestamptz;
