-- Intake role profile & search criteria + known constraints (Jody feedback). Idempotent.
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "must_haves" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "nice_to_haves" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "standout_signals" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "dealbreakers" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "thrive_profile" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "struggle_profile" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "team_context" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "target_companies" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "avoid_companies" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "internal_referrals" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "known_constraints" text;
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "constraints_ack" boolean DEFAULT false NOT NULL;
