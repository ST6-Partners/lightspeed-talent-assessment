-- Company Values framework: value definitions + per-candidate 1–5 scores.
-- Idempotent so it is safe across environments.
DO $$ BEGIN
  CREATE TYPE "value_pillar" AS ENUM ('Mission-Driven', 'Customer-Obsessed', 'Results-Focused');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "company_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "pillar" "value_pillar" NOT NULL,
  "category" varchar(100),
  "description" text,
  "epp_dimensions" jsonb DEFAULT '[]'::jsonb,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "candidate_value_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "value_id" uuid NOT NULL,
  "score" integer NOT NULL,
  "notes" text,
  "scored_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uniq_candidate_value" UNIQUE ("candidate_id", "value_id")
);

DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ADD CONSTRAINT "cvs_candidate_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ADD CONSTRAINT "cvs_value_fk"
    FOREIGN KEY ("value_id") REFERENCES "company_values"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ADD CONSTRAINT "cvs_scored_by_fk"
    FOREIGN KEY ("scored_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
