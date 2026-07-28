-- Rename the candidate_stage value 'Values Review' -> 'Candidate Review'.
-- The stage pivoted from a standalone personality assessment to an automated
-- screen that compares each candidate's EPP percentiles against the EPP traits
-- set for the role in its job description (alongside requirements + skills fit).
-- The values scoring itself now happens later, when an interviewer completes
-- the scorecard. RENAME VALUE relabels the enum in place: existing rows are
-- unaffected and no data backfill is needed. Flow order lives in domain/stages.ts.
ALTER TYPE "candidate_stage" RENAME VALUE 'Values Review' TO 'Candidate Review';
