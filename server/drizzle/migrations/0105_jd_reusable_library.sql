-- Reusable-JD model, part 1 of 2 (additive/backward-compatible).
-- A job description becomes standalone library content: it gets its own
-- department, a requisition points at it via base_jd_id (added in 0024), and a
-- candidate belongs to the requisition (the opening) directly rather than only
-- through the shared JD. Existing jd.req_id readers keep working; part 2 relaxes
-- that column so a JD can also stand alone.

-- 1. JD gets its own department, backfilled from its current requisition.
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "department" varchar(200);

UPDATE "job_descriptions" jd
SET "department" = r."department"
FROM "job_requisitions" r
WHERE jd."req_id" = r."id" AND jd."department" IS NULL;

-- 2. Canonicalize requisition -> library JD. base_jd_id already exists; backfill
-- it from the current 1:1 jd.req_id mapping so every req points at its JD.
UPDATE "job_requisitions" r
SET "base_jd_id" = jd."id"
FROM "job_descriptions" jd
WHERE jd."req_id" = r."id" AND r."base_jd_id" IS NULL;

-- 3. Candidate belongs to the requisition (the opening applied to), not just the
-- reusable JD. This is what keeps candidate-scoping correct once one JD serves
-- several requisitions. Add the link + FK + index, then backfill.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "req_id" uuid;

DO $$ BEGIN
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_req_id_job_requisitions_id_fk"
    FOREIGN KEY ("req_id") REFERENCES "public"."job_requisitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idx_candidates_req_id" ON "candidates" USING btree ("req_id");

UPDATE "candidates" c
SET "req_id" = jd."req_id"
FROM "job_descriptions" jd
WHERE c."jd_id" = jd."id" AND c."req_id" IS NULL AND jd."req_id" IS NOT NULL;
