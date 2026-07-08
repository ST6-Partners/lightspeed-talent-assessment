CREATE TABLE IF NOT EXISTS "candidate_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE cascade,
  "round_name" varchar(120) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'planned' NOT NULL,
  "interviewer_name" varchar(200),
  "interviewer_email" varchar(300),
  "scheduled_at" timestamp with time zone,
  "transcript" text,
  "score" integer,
  "feedback_hr" text,
  "feedback_candidate" text,
  "feedback_interviewer" text,
  "follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prep_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "candidate_interviews_candidate_idx" ON "candidate_interviews" ("candidate_id");
