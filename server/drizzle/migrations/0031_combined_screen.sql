-- Combined screen (resume + values + skills) — one automated screen at the
-- 200 -> 20 gate. Adds the skills-fit signal and a combined screen result set
-- on candidates. All ADD COLUMN IF NOT EXISTS -> safe/idempotent. High journal
-- timestamp so it can't be skipped by a migrate-on-boot collision.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "skills_fit_score" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "skills_fit_notes" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "screen_score" integer;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "screen_recommendation" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "screen_summary" text;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "screened_at" timestamp with time zone;
