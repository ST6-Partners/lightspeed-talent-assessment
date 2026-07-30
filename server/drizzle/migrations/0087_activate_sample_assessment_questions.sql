-- 0087 — activate the two sample pick-list questions.
-- The placeholder assessment (and dept work-sample resolver) only surface tasks
-- with status 'Live'. The two seeded samples were 'Draft', so the candidate
-- assessment page fell back to a generic "details to follow" message. Flip them
-- Live so the assessment shows a real multiple-choice question. Idempotent —
-- only touches the two samples while still Draft.
UPDATE "assessment_tasks"
SET status = 'Live', updated_at = now()
WHERE title IN ('Primary colors (sample)', 'Even numbers (sample)')
  AND status = 'Draft';
