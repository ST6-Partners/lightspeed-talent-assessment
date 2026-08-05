-- Append-only history of adverse-impact (bias) alerts, shown at the bottom of
-- the Bias tab. This is the durable record: unlike per-user notifications
-- (which a recipient can permanently delete from the bell), nothing here is
-- deletable from the UI. One row per alert event (per role per firing).
-- Backfilled from existing bias_alert notifications so past alerts aren't lost.
CREATE TABLE IF NOT EXISTS "bias_alert_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "jd_id" uuid,
  "job_title" varchar(300),
  "summary" text NOT NULL,
  "flagged_count" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Backfill: collapse the per-admin notification copies of each alert event
-- (same role + same message within the same minute) into one history row,
-- dated at the earliest copy.
INSERT INTO "bias_alert_log" ("jd_id", "job_title", "summary", "created_at")
SELECT n."reference_id", jd."job_title", n."message", MIN(n."created_at")
FROM "notifications" n
LEFT JOIN "job_descriptions" jd ON jd."id" = n."reference_id"
WHERE n."type" = 'bias_alert'
GROUP BY n."reference_id", jd."job_title", n."message", date_trunc('minute', n."created_at");
