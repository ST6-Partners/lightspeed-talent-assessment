-- Collapse the two interview stages into one. 'Interview Scheduled' becomes
-- 'Interview', and 'Interviewed' is removed entirely: a candidate now stays in
-- 'Interview' through every round and auto-advances to Work Sample / Reference
-- Check when the last round's scorecard is submitted (maybeAdvanceOnAllRoundsComplete).
--
-- No candidates sit in 'Interviewed' today, but historical candidate_stage_history
-- rows reference both old values, so the USING cast folds BOTH old names into
-- 'Interview' — every existing row (candidates + history) casts cleanly.
-- Postgres can't drop an enum value in place, so (as in 0061 / 0071) recreate the type.
ALTER TYPE "candidate_stage" RENAME TO "candidate_stage_old";

CREATE TYPE "candidate_stage" AS ENUM (
  'Applied',
  'Assessment',
  'Candidate Review',
  'Work Sample',
  'Phone Screen',
  'Interview',
  'Reference Check',
  'Offered',
  'Hired',
  'Rejected',
  'Not Selected'
);

ALTER TABLE "candidates" ALTER COLUMN "current_stage" DROP DEFAULT;
ALTER TABLE "candidates" ALTER COLUMN "current_stage" TYPE "candidate_stage"
  USING (CASE WHEN "current_stage"::text IN ('Interview Scheduled', 'Interviewed') THEN 'Interview' ELSE "current_stage"::text END)::"candidate_stage";
ALTER TABLE "candidates" ALTER COLUMN "current_stage" SET DEFAULT 'Applied';

ALTER TABLE "candidate_stage_history" ALTER COLUMN "from_stage" TYPE "candidate_stage"
  USING (CASE WHEN "from_stage"::text IN ('Interview Scheduled', 'Interviewed') THEN 'Interview' ELSE "from_stage"::text END)::"candidate_stage";
ALTER TABLE "candidate_stage_history" ALTER COLUMN "to_stage" TYPE "candidate_stage"
  USING (CASE WHEN "to_stage"::text IN ('Interview Scheduled', 'Interviewed') THEN 'Interview' ELSE "to_stage"::text END)::"candidate_stage";

DROP TYPE "candidate_stage_old";
