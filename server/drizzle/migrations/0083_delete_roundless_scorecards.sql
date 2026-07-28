-- Scorecards are always tied to an interview round now. Remove any legacy
-- round-less value_reviews (interview_id IS NULL) — seeded demo scorecards and
-- any created before the round became required. Cascades to
-- candidate_value_scores and candidate_capability_scores via FK ON DELETE CASCADE.
DELETE FROM "value_reviews" WHERE "interview_id" IS NULL;
