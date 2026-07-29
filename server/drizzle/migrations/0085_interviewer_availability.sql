-- 0085 — interviewer self-serve availability.
-- Stores availability an interviewer submits from the intake-approval email's
-- tokenized public page (no login). One row per (req_id, email); resubmitting
-- updates in place. Idempotent.
CREATE TABLE IF NOT EXISTS "interviewer_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "req_id" uuid NOT NULL,
  "email" varchar(300) NOT NULL,
  "name" varchar(200),
  "windows" jsonb,
  "note" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "interviewer_availability_req_email_idx" ON "interviewer_availability" ("req_id","email");
