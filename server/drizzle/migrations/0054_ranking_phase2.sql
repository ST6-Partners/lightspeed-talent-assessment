-- Ranking Phase 2: store the full criteria text used for a run (for the editable
-- criteria panel) and whether each ranked candidate had a real resume on file.
ALTER TABLE "ranking_runs" ADD COLUMN IF NOT EXISTS "criteria_text" text;
ALTER TABLE "candidate_rankings" ADD COLUMN IF NOT EXISTS "had_resume" boolean DEFAULT true NOT NULL;
