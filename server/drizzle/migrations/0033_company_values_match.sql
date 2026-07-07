-- Split the screen's values signal into two: EPP match (overall EPP strength)
-- keeps the existing epp_values_match_score column; company-values match gets
-- its own column here. Both are computed from the candidate's real 12-trait
-- EPP results (candidate_epp_scores). ADD COLUMN IF NOT EXISTS -> idempotent.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "company_values_match_score" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "company_values_notes" text;
