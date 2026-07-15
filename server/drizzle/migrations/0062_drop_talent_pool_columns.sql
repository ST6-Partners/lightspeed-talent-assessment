-- Retire the talent-pool feature's storage. The router and UI are gone; these
-- columns are unused. No seed/code ever set them, so there is no meaningful data
-- to lose. Dropping each column also drops its dependent index / FK constraint.
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "in_talent_pool";
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "talent_pool_note";
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "talent_pool_added_at";
ALTER TABLE "candidates" DROP COLUMN IF EXISTS "talent_pool_added_by";
