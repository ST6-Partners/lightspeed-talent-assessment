-- 0096 — interview-round candidate counter-proposals (mirrors the phone-screen flow).
-- When none of the interviewer's offered windows work, the candidate proposes their
-- own slots for a round; the round's interviewer then picks one of these via a
-- tokenized link, or reaches out directly. Stored per round on candidate_interviews.
-- Idempotent.
ALTER TABLE "candidate_interviews" ADD COLUMN IF NOT EXISTS "candidate_proposed_slots" jsonb;
ALTER TABLE "candidate_interviews" ADD COLUMN IF NOT EXISTS "interviewer_token" varchar(64);
