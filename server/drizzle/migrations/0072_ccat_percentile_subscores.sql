-- CCAT percentile + sub-area breakdown (Verbal, Math & Logic, Spatial Reasoning).
-- Criteria returns these alongside the raw score; previously only the raw score
-- was stored. Nullable — populated when the assessment is completed and scores pulled.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ccat_percentile" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ccat_verbal" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ccat_math_logic" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ccat_spatial" integer;
