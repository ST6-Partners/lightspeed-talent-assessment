-- EEO store: voluntary self-identification for aggregate adverse-impact
-- monitoring. Walled off from the candidate evaluation path — read only
-- by the EEO router and the adverse-impact audit service.
CREATE TABLE IF NOT EXISTS "eeo_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "token" varchar(64) NOT NULL,
  "status" varchar(20) DEFAULT 'invited' NOT NULL,
  "sex" varchar(40),
  "race_ethnicity" varchar(80),
  "veteran_status" varchar(40),
  "disability_status" varchar(40),
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "eeo_responses"
    ADD CONSTRAINT "eeo_responses_candidate_id_candidates_id_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "eeo_responses_token_idx" ON "eeo_responses" ("token");
CREATE UNIQUE INDEX IF NOT EXISTS "eeo_responses_candidate_idx" ON "eeo_responses" ("candidate_id");
