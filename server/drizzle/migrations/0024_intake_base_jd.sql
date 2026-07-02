-- Remember which existing JD an intake is based on (the "old JD"). Idempotent;
-- job_requisitions already exists, so ADD COLUMN IF NOT EXISTS is safe.
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "base_jd_id" uuid;
