-- Per-slot phone-screen selection: store the individual proposed windows and the
-- specific slot the candidate confirmed, so the recruiter knows which time was picked.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_slots" jsonb;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_selected_slot" text;
