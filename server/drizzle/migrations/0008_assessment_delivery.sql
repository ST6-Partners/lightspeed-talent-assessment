-- Assessment delivery: package delivery settings + timed candidate sessions. Idempotent.

-- 1) Delivery settings on packages.
ALTER TABLE "assessment_packages" ADD COLUMN IF NOT EXISTS "delivery_mode" varchar(20) DEFAULT 'scheduled' NOT NULL;
ALTER TABLE "assessment_packages" ADD COLUMN IF NOT EXISTS "window_minutes" integer DEFAULT 90 NOT NULL;

-- 2) Session status enum.
DO $$ BEGIN
  CREATE TYPE "session_status" AS ENUM ('scheduled', 'in_progress', 'submitted', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) Assessment sessions table.
CREATE TABLE IF NOT EXISTS "assessment_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid,
  "candidate_id" uuid,
  "candidate_email" varchar(300) NOT NULL,
  "token" varchar(64) NOT NULL,
  "scheduled_start" timestamp with time zone,
  "started_at" timestamp with time zone,
  "due_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "status" "session_status" DEFAULT 'scheduled' NOT NULL,
  "general_response" text,
  "general_show_work" text,
  "functional_response" text,
  "functional_show_work" text,
  "work_score" integer,
  "ai_score" integer,
  "score_rationale" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "assessment_sessions" ADD CONSTRAINT "as_token_unique" UNIQUE ("token");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "assessment_sessions" ADD CONSTRAINT "as_package_fk"
    FOREIGN KEY ("package_id") REFERENCES "assessment_packages"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "assessment_sessions" ADD CONSTRAINT "as_candidate_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
