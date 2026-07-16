-- Work-sample delivery mode: take-home submission vs live Zoom walkthrough.
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "delivery_mode" varchar(20) DEFAULT 'take_home' NOT NULL;
