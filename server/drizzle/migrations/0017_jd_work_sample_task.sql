-- Associate each job description with a specific Work Sample library task.
-- The task's instructions live only in the library; the JD just points to it.
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "work_sample_task_id" uuid;

DO $$ BEGIN
  ALTER TABLE "job_descriptions" ADD CONSTRAINT "jd_work_sample_task_fk"
    FOREIGN KEY ("work_sample_task_id") REFERENCES "assessment_tasks"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Pre-fill: link each JD to its department's Live work sample (via the requisition).
UPDATE "job_descriptions" jd
SET "work_sample_task_id" = t."id"
FROM "job_requisitions" r, "departments" d, "assessment_tasks" t
WHERE jd."req_id" = r."id"
  AND d."name" = r."department"
  AND t."department_id" = d."id"
  AND t."status" = 'Live'
  AND t."active" = true
  AND jd."work_sample_task_id" IS NULL;
