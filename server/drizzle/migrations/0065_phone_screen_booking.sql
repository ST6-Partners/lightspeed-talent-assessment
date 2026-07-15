-- Phone-screen self-scheduling (phone-call Calendly event; no video link).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_booking_token" varchar(64);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_booking_opened_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "phone_screen_scheduled_at" timestamp with time zone;
