-- 0084 — multi_select (pick-list) work samples.
-- Adds a structured "pick a fixed number of options from a list" answer format
-- to the task library, plus a column on candidates to store which options a
-- candidate ticked. Seeds two sample pick-list tasks (Draft, General) so the
-- new format is immediately demoable. All idempotent.

-- assessment_tasks: answer format + option data (nullable except the format flag).
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "answer_format" varchar(20) NOT NULL DEFAULT 'free_text';
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "options" jsonb;
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "correct_options" jsonb;
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "select_count" integer;

-- candidates: the exact options ticked on a multi_select work sample (auto-graded).
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "work_sample_selections" jsonb;

-- Seed sample pick-list task #1 — primary colors (idempotent, guarded by title).
INSERT INTO "assessment_tasks"
  (title, department_id, difficulty, time_limit_min, brief, status, delivery_mode,
   answer_format, options, correct_options, select_count, version, active)
SELECT
  'Primary colors (sample)', NULL, 'Entry', 5,
  'From the list below, choose the three primary colors.',
  'Draft', 'take_home', 'multi_select',
  '["Red","Green","Blue","Yellow","Orange","Purple","Black","White"]'::jsonb,
  '["Red","Blue","Yellow"]'::jsonb, 3, 1, true
WHERE NOT EXISTS (SELECT 1 FROM "assessment_tasks" WHERE title = 'Primary colors (sample)');

-- Seed sample pick-list task #2 — even numbers (idempotent, guarded by title).
INSERT INTO "assessment_tasks"
  (title, department_id, difficulty, time_limit_min, brief, status, delivery_mode,
   answer_format, options, correct_options, select_count, version, active)
SELECT
  'Even numbers (sample)', NULL, 'Entry', 5,
  'From the list below, choose the three even numbers.',
  'Draft', 'take_home', 'multi_select',
  '["3","4","7","8","11","12"]'::jsonb,
  '["4","8","12"]'::jsonb, 3, 1, true
WHERE NOT EXISTS (SELECT 1 FROM "assessment_tasks" WHERE title = 'Even numbers (sample)');
