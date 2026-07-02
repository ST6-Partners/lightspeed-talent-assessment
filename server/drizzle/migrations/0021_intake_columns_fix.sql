-- 0021: ensure the intake columns/tables exist. Re-applies 0020 idempotently
-- with a guaranteed-higher journal timestamp so the migrator cannot skip it
-- (0020 was being marked applied without its ALTERs running). Fully idempotent.

ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "reason_type" varchar(40);
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "role_change_note" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "work_arrangement" varchar(20) DEFAULT 'On-site';
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "hybrid_days" integer;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "comp_basis" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "variable_comp" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "finance_confirmed" boolean DEFAULT false NOT NULL;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "interview_rounds" integer DEFAULT 1;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "question_source" varchar(20) DEFAULT 'standard';
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "team_availability_confirmed" boolean DEFAULT false NOT NULL;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "timeline_template" varchar(20) DEFAULT 'standard';
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "target_post_date" date;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "target_offer_date" date;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "approval_mode" varchar(20) DEFAULT 'explicit' NOT NULL;

CREATE TABLE IF NOT EXISTS "interview_plan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "req_id" uuid NOT NULL,
  "round_name" varchar(120) NOT NULL,
  "length_min" integer,
  "format" varchar(60),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "interview_plan" ADD CONSTRAINT "ip_req_fk" FOREIGN KEY ("req_id") REFERENCES "job_requisitions"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "hiring_team" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "req_id" uuid NOT NULL,
  "person_ref" varchar(200) NOT NULL,
  "role_in_process" varchar(120),
  "round_ref" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "hiring_team" ADD CONSTRAINT "ht_req_fk" FOREIGN KEY ("req_id") REFERENCES "job_requisitions"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "awareness_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "req_id" uuid NOT NULL,
  "person_ref" varchar(200) NOT NULL,
  "source" varchar(20) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "awareness_list" ADD CONSTRAINT "al_req_fk" FOREIGN KEY ("req_id") REFERENCES "job_requisitions"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "req_id" uuid NOT NULL,
  "step" integer NOT NULL,
  "approver_ref" varchar(200),
  "approver_role" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "note" text,
  "acted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "approvals" ADD CONSTRAINT "ap_req_fk" FOREIGN KEY ("req_id") REFERENCES "job_requisitions"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
