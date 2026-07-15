-- Make the database's candidate_stage order match the funnel the app actually
-- runs. The type was declared with Work Sample before Values Review, but every
-- operational list (client + server stage lists, funnel, backfill order, the
-- post-assessment flow) puts Values Review first. Postgres can't reorder enum
-- values in place, so recreate the type in the correct order and repoint the
-- three columns that use it. Value strings are unchanged, so every existing row
-- casts cleanly (no data change) — only the type's intrinsic sort order is fixed.
ALTER TYPE "candidate_stage" RENAME TO "candidate_stage_old";

CREATE TYPE "candidate_stage" AS ENUM (
  'Applied',
  'Assessment',
  'Values Review',
  'Work Sample',
  'Phone Screen',
  'Interview Scheduled',
  'Interviewed',
  'Offered',
  'Hired',
  'Rejected',
  'Not Selected'
);

ALTER TABLE "candidates" ALTER COLUMN "current_stage" DROP DEFAULT;
ALTER TABLE "candidates" ALTER COLUMN "current_stage" TYPE "candidate_stage" USING "current_stage"::text::"candidate_stage";
ALTER TABLE "candidates" ALTER COLUMN "current_stage" SET DEFAULT 'Applied';

ALTER TABLE "candidate_stage_history" ALTER COLUMN "from_stage" TYPE "candidate_stage" USING "from_stage"::text::"candidate_stage";
ALTER TABLE "candidate_stage_history" ALTER COLUMN "to_stage" TYPE "candidate_stage" USING "to_stage"::text::"candidate_stage";

DROP TYPE "candidate_stage_old";
