-- Add the Operations department (was not in the original uploaded sheet) and
-- give it a work sample. Idempotent.

INSERT INTO "departments" ("name")
SELECT 'Operations' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Operations');

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Untangle a broken process$ws$, (SELECT id FROM departments WHERE name='Operations' LIMIT 1), 'Mid', 45,
$ws$An internal process is slow and error-prone. New-customer onboarding currently works like this: Sales emails a spreadsheet of the new account to Ops; Ops manually creates the account in three separate systems; a person copies details between them by hand; the customer is emailed login details three to five days later; and about one in five onboardings has a data-entry error that support has to fix later.

In 45 minutes: (1) identify the biggest bottlenecks and failure points, (2) propose a streamlined process, and (3) say how you would measure whether it improved. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Pinpoints the real bottlenecks and error sources (manual re-keying, handoffs, delay), proposes a coherent streamlined process (a single source of truth, automation, and checks), and names concrete metrics such as cycle time and error rate.$ws$,
$ws$Uses AI to map the process and generate options, while applying judgment about what is realistic to change and where a human check still belongs.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Untangle a broken process$ws$);
