-- Distinguish external vs internal-move offers in the approval gate. Idempotent.
ALTER TABLE "offer_approvals" ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'external' NOT NULL;
