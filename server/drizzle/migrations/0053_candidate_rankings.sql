-- Candidate ranking (advisory). Two tables: one row per ranking run per role,
-- and one row per ranked candidate in that run. No auto-decisions are made from
-- these; they only order the pool for a human to review.
CREATE TABLE IF NOT EXISTS "ranking_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "jd_id" uuid NOT NULL,
  "req_id" uuid,
  "total_ranked" integer DEFAULT 0 NOT NULL,
  "criteria_summary" text,
  "limited_data" boolean DEFAULT false NOT NULL,
  "model" varchar(100),
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "candidate_rankings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "jd_id" uuid NOT NULL,
  "candidate_id" uuid NOT NULL,
  "rank" integer NOT NULL,
  "sort_score" integer DEFAULT 0 NOT NULL,
  "recommendation" text,
  "strengths" jsonb DEFAULT '[]'::jsonb,
  "concerns" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "candidate_rankings_jd_idx" ON "candidate_rankings" ("jd_id");
CREATE INDEX IF NOT EXISTS "ranking_runs_jd_idx" ON "ranking_runs" ("jd_id");
