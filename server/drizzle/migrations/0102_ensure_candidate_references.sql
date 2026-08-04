-- Safety net: guarantee the candidate_references table exists before the app's
-- references feature (candidates.create insert + candidates.references query)
-- uses it. The table was first added in migration 0023, but a historical
-- duplicate-timestamp collision in the journal means some environments may have
-- skipped it incrementally (flagged in the Railway Registry). CREATE TABLE IF
-- NOT EXISTS is a no-op where it already exists.
CREATE TABLE IF NOT EXISTS "candidate_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "name" varchar(200) NOT NULL,
  "email" varchar(300) NOT NULL,
  "relationship" varchar(200),
  "token" varchar(64) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "response" text,
  "would_rehire" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidate_references" ADD CONSTRAINT "cref_candidate_fk" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
