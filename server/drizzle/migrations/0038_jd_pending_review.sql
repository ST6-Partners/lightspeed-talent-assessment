-- 0038: flag intake-generated JDs that still need hiring-manager review.
-- New-JD intake reasons (replacement / termination / new headcount) create a JD
-- marked pending_review = true; the hiring manager clears it by approving the JD.
-- Idempotent.
ALTER TABLE "job_descriptions" ADD COLUMN IF NOT EXISTS "pending_review" boolean DEFAULT false NOT NULL;
