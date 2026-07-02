-- Configurable approval chain: store the intake's approver plan + a concurrency
-- group index on each approval. Both tables already exist -> ADD COLUMN IF NOT
-- EXISTS is safe. High journal timestamp so it can't be skipped by collisions.
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "approval_plan" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "group_idx" integer DEFAULT 0 NOT NULL;
