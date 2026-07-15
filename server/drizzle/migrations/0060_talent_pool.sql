-- Talent pool (keep-warm): flag strong-but-not-selected candidates so they can
-- be surfaced and re-engaged for future roles. Reactivation creates a fresh
-- candidate row for the target role (handled in the talentPool router).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "in_talent_pool" boolean DEFAULT false NOT NULL;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "talent_pool_note" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "talent_pool_added_at" timestamp with time zone;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "talent_pool_added_by" uuid;

DO $$ BEGIN
  ALTER TABLE "candidates"
    ADD CONSTRAINT "candidates_talent_pool_added_by_users_id_fk"
    FOREIGN KEY ("talent_pool_added_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "candidates_in_talent_pool_idx" ON "candidates" ("in_talent_pool");
