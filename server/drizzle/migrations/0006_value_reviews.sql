-- Multi-reviewer value scoring: employees, value_reviews, and rework
-- candidate_value_scores to belong to a review (one candidate → many reviews).
CREATE TABLE IF NOT EXISTS "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "title" varchar(200),
  "email" varchar(300),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "value_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "reviewer_id" uuid,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "value_reviews" ADD CONSTRAINT "vr_candidate_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "value_reviews" ADD CONSTRAINT "vr_reviewer_fk"
    FOREIGN KEY ("reviewer_id") REFERENCES "employees"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Rework candidate_value_scores (table is empty in dev): swap candidate_id → review_id.
ALTER TABLE "candidate_value_scores" DROP CONSTRAINT IF EXISTS "uniq_candidate_value";
ALTER TABLE "candidate_value_scores" DROP CONSTRAINT IF EXISTS "cvs_candidate_fk";
ALTER TABLE "candidate_value_scores" DROP CONSTRAINT IF EXISTS "cvs_scored_by_fk";
DELETE FROM "candidate_value_scores";
ALTER TABLE "candidate_value_scores" DROP COLUMN IF EXISTS "candidate_id";
ALTER TABLE "candidate_value_scores" DROP COLUMN IF EXISTS "scored_by";
ALTER TABLE "candidate_value_scores" ADD COLUMN IF NOT EXISTS "review_id" uuid;
DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ALTER COLUMN "review_id" SET NOT NULL;
EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ADD CONSTRAINT "cvs_review_fk"
    FOREIGN KEY ("review_id") REFERENCES "value_reviews"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "candidate_value_scores" ADD CONSTRAINT "uniq_review_value" UNIQUE ("review_id", "value_id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
