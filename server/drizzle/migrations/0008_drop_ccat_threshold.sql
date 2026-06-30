-- Remove the per-role CCAT threshold from job descriptions.
-- It was identical (30) on every role, so it is being dropped from the
-- model, the create/edit form, the table column, and the page subtitle.
-- The candidate-level CCAT score (candidates.ccat_score) is unrelated and retained.
ALTER TABLE "job_descriptions" DROP COLUMN IF EXISTS "ccat_threshold";
