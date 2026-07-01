-- Store the Insights Discovery PDF bytes in Postgres (Railway has no object storage).
ALTER TABLE "insights_discovery_profiles" ADD COLUMN IF NOT EXISTS "pdf_data" bytea;
ALTER TABLE "insights_discovery_profiles" ALTER COLUMN "pdf_key" DROP NOT NULL;
