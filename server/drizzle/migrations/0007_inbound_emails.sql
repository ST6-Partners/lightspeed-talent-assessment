-- Inbound / test emails: powers the admin SendGrid test inbox and seeds the
-- candidate-reply Inbound Parse pipeline. Idempotent (mirrors 0002/0005 style).
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
