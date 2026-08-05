-- Per-reference outcome on the Reference Check card. Each reference the candidate
-- provided can now be marked cleared / concerns / failed individually (with an
-- optional note), instead of a single candidate-level roll-up. The candidate-level
-- reference_outcome (migration 0100) still drives the pipeline action; these
-- columns hold the detailed per-reference record. Allowed outcome values are
-- enforced in the app/tRPC layer; stored as text to match the existing lightweight
-- reference columns. IF NOT EXISTS keeps this a no-op where already applied.
ALTER TABLE "candidate_references" ADD COLUMN IF NOT EXISTS "outcome" varchar(20);--> statement-breakpoint
ALTER TABLE "candidate_references" ADD COLUMN IF NOT EXISTS "outcome_notes" text;--> statement-breakpoint
ALTER TABLE "candidate_references" ADD COLUMN IF NOT EXISTS "outcome_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_references" ADD COLUMN IF NOT EXISTS "outcome_by" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidate_references" ADD CONSTRAINT "cref_outcome_by_fk" FOREIGN KEY ("outcome_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
