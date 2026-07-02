-- Mark auto-generated (intake) job descriptions as new. Idempotent.
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "auto_generated" boolean DEFAULT false NOT NULL;
