-- Internal-candidate handling. Idempotent.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "is_internal" boolean DEFAULT false NOT NULL;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "manager_aware" boolean DEFAULT false NOT NULL;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "internal_employee" varchar(200);
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "leadership_awareness" text;
