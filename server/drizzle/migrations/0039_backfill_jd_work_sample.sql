-- 0039: best-guess link existing JDs to a Work Sample library task by department.
-- Only fills JDs with no explicit link. Prefers the JD's requisition-department
-- task (Live first, then any active), else a General (department-less) task.
-- Idempotent: touches only NULL work_sample_task_id rows.
UPDATE "job_descriptions" jd
SET "work_sample_task_id" = COALESCE(
  (SELECT t.id FROM "assessment_tasks" t
     JOIN "job_requisitions" r ON r.id = jd.req_id
     JOIN "departments" d ON lower(d.name) = lower(r.department)
    WHERE t.department_id = d.id AND t.active = true
    ORDER BY (t.status = 'Live') DESC, t.created_at ASC
    LIMIT 1),
  (SELECT t.id FROM "assessment_tasks" t
    WHERE t.department_id IS NULL AND t.active = true
    ORDER BY (t.status = 'Live') DESC, t.created_at ASC
    LIMIT 1)
)
WHERE jd."work_sample_task_id" IS NULL;
