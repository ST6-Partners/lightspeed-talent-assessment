-- Backfill assessment data so every candidate has resume text, EPP results, and a CCAT score.
-- Idempotent: only fills what's missing; EPP insert uses ON CONFLICT DO NOTHING.

-- 1) resume_text column
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "resume_text" text;

-- 2) CCAT: cap any impossible values at 50 (test is out of 50), then fill missing ones (22-50, deterministic).
UPDATE "candidates" SET "ccat_score" = 50 WHERE "ccat_score" > 50;
UPDATE "candidates"
SET "ccat_score" = 22 + (abs(('x' || substr(md5("id"::text), 1, 8))::bit(32)::int) % 29)
WHERE "ccat_score" IS NULL;

-- 3) EPP: give every candidate the 12 Criteria traits (percentile 35-95, deterministic per candidate+trait).
INSERT INTO "candidate_epp_scores" ("candidate_id", "trait", "percentile")
SELECT c."id", t."trait",
       35 + (abs(('x' || substr(md5(c."id"::text || t."trait"), 1, 8))::bit(32)::int) % 61)
FROM "candidates" c
CROSS JOIN (VALUES
  ('Achievement'),('Assertiveness'),('Competitiveness'),('Conscientiousness'),
  ('Cooperativeness'),('Extroversion'),('Managerial'),('Motivation'),
  ('Openness'),('Patience'),('Self-Confidence'),('Stress Tolerance')
) AS t("trait")
ON CONFLICT ("candidate_id", "trait") DO NOTHING;

-- 4) resume text: a realistic generic resume for every candidate missing one.
UPDATE "candidates"
SET "resume_text" =
  'PROFESSIONAL SUMMARY' || chr(10) ||
  "first_name" || ' ' || "last_name" || ' is a results-driven professional with 6+ years of experience delivering high-quality work in fast-paced environments. Strong communicator and collaborator with a track record of ownership and measurable impact.' || chr(10) || chr(10) ||
  'EXPERIENCE' || chr(10) ||
  '- Led cross-functional projects from concept to delivery, coordinating across product, engineering, and operations.' || chr(10) ||
  '- Improved process efficiency and quality through data-informed decisions and continuous iteration.' || chr(10) ||
  '- Mentored teammates and contributed to a collaborative, high-standards culture.' || chr(10) || chr(10) ||
  'SKILLS' || chr(10) ||
  '- Communication, problem-solving, collaboration, project management, data analysis, stakeholder management, adaptability.' || chr(10) || chr(10) ||
  'EDUCATION' || chr(10) ||
  '- B.S. in a relevant field.'
WHERE "resume_text" IS NULL;
