-- Per-JD work sample upload placeholder.
-- Built-in work sample task content is tabled; each JD can attach an uploaded
-- work sample file instead. Adds the upload columns, then removes the existing
-- seeded work samples.

ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "work_sample_upload_url" text;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "work_sample_upload_name" text;--> statement-breakpoint

-- Delete the existing work samples. FK references to assessment_tasks
-- (job_descriptions.work_sample_task_id and assessment_packages
-- general_task_id / functional_task_id) are all ON DELETE SET NULL, so these
-- links null out automatically and no dependent rows are removed. Candidate
-- work-sample submissions live in inline columns on candidates and are untouched.
DELETE FROM "assessment_tasks";
