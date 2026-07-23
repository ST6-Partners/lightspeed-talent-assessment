-- Intake-time "should this role have a work sample?" answer, captured on the
-- requisition so it's available later when the new JD is generated at
-- approval time (non-backfill reasons only -- backfill reuses the existing
-- JD's own workSampleRequired as-is). Defaults true to match today's implicit
-- behavior (work sample generated for every new_headcount role).
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "work_sample_required" boolean NOT NULL DEFAULT true;
