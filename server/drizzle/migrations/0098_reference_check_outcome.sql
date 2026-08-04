-- Reference Check becomes a real decision gate instead of a manual-only arrow.
-- A recorder picks an outcome for the candidate's references — cleared / concerns
-- / failed — plus optional notes. "cleared" promotes the candidate to Offer,
-- "failed" rejects, "concerns" holds them in Reference Check. The allowed outcome
-- values are enforced in the app/tRPC layer; stored here as text to match the
-- existing lightweight per-candidate columns (e.g. work_sample_score/notes).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "reference_outcome" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "reference_notes" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "reference_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "reference_decided_by" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_reference_decided_by_fk" FOREIGN KEY ("reference_decided_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
