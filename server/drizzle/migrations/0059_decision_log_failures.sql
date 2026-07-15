-- Safety net for the decision provenance log. logDecision is intentionally
-- non-blocking (a logging hiccup must never change a hiring decision), but a
-- dropped write used to vanish silently — and the adverse-impact audit reads
-- decision_log, so a missing row quietly drops a candidate from the compliance
-- report. This dead-letter table captures any write that fails after a retry,
-- so the gap is visible (surfaced on the fairness audit) and recoverable
-- (an admin can replay these rows back into decision_log).
CREATE TABLE IF NOT EXISTS "decision_log_failures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidate_id" uuid,
  "decision_type" varchar(50),
  "outcome" varchar(30),
  "payload" jsonb,
  "error" text,
  "resolved" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone
);
