-- Ensure the test-inbox columns exist even if an older 0007 created the table
-- without them. Idempotent; high journal timestamp so the runner can't skip it.
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "from_name" varchar(255);
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "to_email" varchar(320);
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "reply_tag" varchar(120);
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'webhook' NOT NULL;
