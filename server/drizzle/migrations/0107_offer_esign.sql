-- Offer e-signature (Adobe Sign / in-app tokenized signing page).
-- The offer email now carries an "Agree & sign" button → /offer-sign/<token>.
-- On signature the candidate auto-advances to Hired and the role auto-closes
-- once its openings are filled. offer_signed_at makes completion idempotent.
-- IF NOT EXISTS keeps this a no-op where already applied.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_sign_token" varchar(64);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_agreement_id" varchar(128);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_signed_at" timestamp with time zone;
