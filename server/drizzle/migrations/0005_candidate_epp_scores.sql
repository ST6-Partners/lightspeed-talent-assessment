-- Criteria EPP per-candidate per-trait percentile scores.
CREATE TABLE IF NOT EXISTS "candidate_epp_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "trait" varchar(60) NOT NULL,
  "percentile" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uniq_candidate_trait" UNIQUE ("candidate_id", "trait")
);
DO $$ BEGIN
  ALTER TABLE "candidate_epp_scores" ADD CONSTRAINT "ceps_candidate_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
