-- Remove the Reference Check stage entirely. Postgres can't DROP a value from an
-- enum in place, so (as in 0061) recreate candidate_stage without it. First move
-- any candidates/history sitting on 'Reference Check' back to 'Interviewed' so
-- every existing row casts cleanly into the new type.
UPDATE "candidates" SET "current_stage" = 'Interviewed' WHERE "current_stage" = 'Reference Check';
UPDATE "candidate_stage_history" SET "from_stage" = 'Interviewed' WHERE "from_stage" = 'Reference Check';
UPDATE "candidate_stage_history" SET "to_stage" = 'Interviewed' WHERE "to_stage" = 'Reference Check';

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
