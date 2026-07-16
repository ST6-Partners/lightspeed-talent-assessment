-- Work sample is now optional per role rather than an automated up-front step.
-- This flag turns the Work Sample stage on for a given job. Default false so
-- existing roles skip the work sample unless a recruiter opts in.
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "work_sample_required" boolean NOT NULL DEFAULT false;
