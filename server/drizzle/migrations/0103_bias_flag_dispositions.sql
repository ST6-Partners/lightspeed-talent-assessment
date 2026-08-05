-- Bias-flag disposition / lifecycle (Remediate-this-flag, Bias tab).
-- One row per role (job_description). Lets an admin acknowledge an
-- adverse-impact flag (reviewed / validated & documented / remediation
-- applied — monitoring) or snooze it, so the hourly bias-alert job stops
-- re-raising a flag nobody has abandoned. Holds NO demographic data — it
-- is a workflow/audit-trail record only, safe outside the EEO wall.
CREATE TABLE IF NOT EXISTS "bias_flag_dispositions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "jd_id" uuid NOT NULL,
  "status" varchar(40) DEFAULT 'open' NOT NULL,
  "note" text,
  "snooze_until" timestamp with time zone,
  "decided_by" uuid,
  "decided_by_name" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bias_flag_dispositions_jd_id_unique" UNIQUE("jd_id")
);
