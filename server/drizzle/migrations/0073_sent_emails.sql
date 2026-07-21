-- Outbound email capture ("test inbox" for sent mail). Records every dispatched
-- email with its full body so the automated-email set can be reviewed without a
-- live SendGrid key. No FK — rows persist independently of candidates.
CREATE TABLE IF NOT EXISTS "sent_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient" varchar(600) NOT NULL,
  "subject" varchar(500),
  "template" varchar(120),
  "body" text,
  "status" varchar(20) DEFAULT 'sandbox' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
