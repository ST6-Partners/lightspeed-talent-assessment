-- Offer-approval gate: the offer letter goes to the hiring manager for
-- review/edit/sign-off BEFORE it is sent to the candidate. Idempotent.
CREATE TABLE IF NOT EXISTS "offer_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "manager_name" varchar(200),
  "manager_note" text,
  "created_by" uuid,
  "decided_at" timestamp with time zone,
  "sent_to_candidate_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "offer_approvals" ADD CONSTRAINT "offer_approvals_candidate_id_candidates_id_fk"
    FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "offer_approvals" ADD CONSTRAINT "offer_approvals_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "offer_approvals_candidate_idx" ON "offer_approvals" ("candidate_id");
