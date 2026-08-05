-- Candidate can decline the offer (the "Decline offer" button next to
-- "Agree & sign"). Declining stamps offer_declined_at (+ optional reason) and
-- closes the candidate out without sending a company-rejection email. Stored as
-- lightweight columns alongside the existing offer_signed_at. IF NOT EXISTS keeps
-- this a no-op where already applied.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_decline_reason" text;
