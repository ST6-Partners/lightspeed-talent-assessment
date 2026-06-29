-- Assessment packages: General + functional task pairings (assignments). Idempotent.
CREATE TABLE IF NOT EXISTS "assessment_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(300) NOT NULL,
  "department_id" uuid,
  "general_task_id" uuid,
  "functional_task_id" uuid,
  "status" "task_status" DEFAULT 'Draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "assessment_packages" ADD CONSTRAINT "ap_department_fk"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "assessment_packages" ADD CONSTRAINT "ap_general_task_fk"
    FOREIGN KEY ("general_task_id") REFERENCES "assessment_tasks"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "assessment_packages" ADD CONSTRAINT "ap_functional_task_fk"
    FOREIGN KEY ("functional_task_id") REFERENCES "assessment_tasks"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "assessment_packages" ADD CONSTRAINT "ap_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
