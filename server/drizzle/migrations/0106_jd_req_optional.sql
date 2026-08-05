-- Reusable-JD model, part 2 of 2.
-- Stop forcing a job description to belong to a requisition. A JD can now live
-- on its own in the library; deleting a requisition DETACHES its JD (set null)
-- instead of cascade-deleting it. Candidates survive via their own req_id/jd_id.
ALTER TABLE "job_descriptions" ALTER COLUMN "req_id" DROP NOT NULL;

ALTER TABLE "job_descriptions" DROP CONSTRAINT IF EXISTS "job_descriptions_req_id_job_requisitions_id_fk";

ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_req_id_job_requisitions_id_fk"
  FOREIGN KEY ("req_id") REFERENCES "public"."job_requisitions"("id") ON DELETE set null ON UPDATE no action;
