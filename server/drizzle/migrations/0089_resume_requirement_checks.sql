-- Persist the per-requirement resume-screen results (requirement, met, evidence)
-- so the Candidates and Review panels can show met/not-met as bullet lists.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_requirement_checks" jsonb;
