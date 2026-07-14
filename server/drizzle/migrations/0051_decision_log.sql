-- Phase 2: decision provenance & transparency
-- One row per candidate-affecting decision (rule, AI, or human).
CREATE TABLE IF NOT EXISTS "decision_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "decision_type" varchar(50) NOT NULL,
  "outcome" varchar(30) NOT NULL,
  "score" integer,
  "decided_by_type" varchar(20) DEFAULT 'ai' NOT NULL,
  "decided_by" uuid,
  "model" varchar(80),
  "requested_model" varchar(80),
  "prompt_id" varchar(80),
  "prompt_version" varchar(20),
  "reason" text NOT NULL,
  "inputs" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "decision_log"
    ADD CONSTRAINT "decision_log_candidate_id_candidates_id_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "decision_log"
    ADD CONSTRAINT "decision_log_decided_by_users_id_fk"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "decision_log_candidate_id_idx" ON "decision_log" ("candidate_id");
CREATE INDEX IF NOT EXISTS "decision_log_type_idx" ON "decision_log" ("decision_type");
