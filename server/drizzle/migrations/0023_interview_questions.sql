-- Role-level interview questions generated when an intake is approved.
-- CREATE ... IF NOT EXISTS (safe whether present or not); high journal timestamp.
CREATE TABLE IF NOT EXISTS "interview_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "req_id" uuid NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" varchar(20) DEFAULT 'standard' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN ALTER TABLE "interview_questions" ADD CONSTRAINT "iq_req_fk" FOREIGN KEY ("req_id") REFERENCES "job_requisitions"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
