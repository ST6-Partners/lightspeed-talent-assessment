-- Assessment task library (curated work samples). Idempotent.
DO $$ BEGIN CREATE TYPE "task_difficulty" AS ENUM ('Entry','Mid','Senior'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "task_status" AS ENUM ('Draft','In Review','Live','Retired'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "assessment_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(300) NOT NULL,
  "department_id" uuid,
  "difficulty" "task_difficulty" DEFAULT 'Mid' NOT NULL,
  "time_limit_min" integer,
  "brief" text,
  "show_your_work_instructions" text,
  "scoring_guide_work" text,
  "scoring_guide_ai" text,
  "status" "task_status" DEFAULT 'Draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "assessment_tasks" ADD CONSTRAINT "at_department_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "assessment_tasks" ADD CONSTRAINT "at_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null; EXCEPTION WHEN duplicate_object THEN null; END $$;
