-- Track how many times a candidate has been flagged for human review across the
-- funnel. Each gate that recommends rejection (post-assessment values/EPP, the
-- combined screen, the work sample) raises the review flag and bumps this count,
-- so clearing the flag once (a reviewer advancing them) never stops a later gate
-- from flagging them again. The UI shows the count when it is greater than one.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "review_flag_count" integer NOT NULL DEFAULT 0;
