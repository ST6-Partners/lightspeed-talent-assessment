ALTER TABLE "insights_discovery_profiles" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'upload' NOT NULL;
