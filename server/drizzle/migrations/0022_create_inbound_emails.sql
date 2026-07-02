-- The original 0007 that creates inbound_emails was SKIPPED on some DBs: its real
-- timestamp is older than 0003's bogus sentinel (1799999999999), so the migration
-- runner never applied it and the table was never created. This re-creates it
-- (CREATE ... IF NOT EXISTS = safe whether or not it already exists) with a high
-- journal timestamp so the runner cannot skip it.
CREATE TABLE IF NOT EXISTS "inbound_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_email" varchar(320) NOT NULL,
  "from_name" varchar(255),
  "to_email" varchar(320),
  "subject" varchar(500),
  "body" text,
  "reply_tag" varchar(120),
  "source" varchar(20) DEFAULT 'webhook' NOT NULL,
  "raw" jsonb,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
