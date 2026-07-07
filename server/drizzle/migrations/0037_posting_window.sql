-- Internal-first posting window: durable anchor on the requisition itself
-- (replaces the fragile test-inbox record anchor). Idempotent.
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "external_opened_at" timestamp with time zone;
