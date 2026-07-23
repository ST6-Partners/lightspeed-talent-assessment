-- Hard cutoff: Criteria Corp can flag a CCAT/EPP submission as an invalid
-- result (e.g. failed validity/consistency checks — shows as a red "Warning:
-- Invalid Result" banner on the Criteria score report). When set, the
-- assessment gate auto-rejects regardless of the raw CCAT score, in addition
-- to the existing score < 30 (~70th percentile) threshold. Nullable/defaulted
-- false — only true when Criteria (or a manual override) flags it.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "ccat_invalid_result" boolean NOT NULL DEFAULT false;
