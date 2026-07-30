-- The real call start/end for the confirmed phone-screen slot. phone_screen_scheduled_at
-- is now set to the parsed slot START time (not the moment the candidate clicked
-- confirm); phone_screen_end_at is that same slot's END time. The post-call decision
-- reminder fires right at phone_screen_end_at (e.g. a 3-4pm slot reminds at 4pm)
-- instead of a flat 30 min after whenever the candidate happened to confirm.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_end_at" timestamp with time zone;
