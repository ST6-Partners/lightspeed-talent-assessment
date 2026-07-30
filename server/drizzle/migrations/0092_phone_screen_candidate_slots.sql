-- 0092 — candidate counter-proposal slots for phone screens.
-- When none of the recruiter's proposed windows work, the candidate proposes
-- their own slots (same picker); the recruiter then picks one of these. Stored
-- separately from the recruiter's phone_screen_slots. Idempotent.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_candidate_slots" jsonb;
