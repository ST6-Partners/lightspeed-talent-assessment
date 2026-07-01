-- Insights Discovery profiles: uploaded PDF + parsed Colour Dynamics. Idempotent.
CREATE TABLE IF NOT EXISTS "insights_discovery_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "pdf_key" text NOT NULL,
  "pdf_filename" varchar(300),
  "type_number" integer,
  "type_name" varchar(200),
  "lc_type_number" integer,
  "lc_type_name" varchar(200),
  "conscious" jsonb,
  "less_conscious" jsonb,
  "parse_status" varchar(20) DEFAULT 'ok' NOT NULL,
  "parse_error" text,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "insights_discovery_profiles" ADD CONSTRAINT "idp_candidate_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "insights_discovery_profiles" ADD CONSTRAINT "idp_uploaded_by_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "idp_candidate_idx" ON "insights_discovery_profiles" ("candidate_id");
