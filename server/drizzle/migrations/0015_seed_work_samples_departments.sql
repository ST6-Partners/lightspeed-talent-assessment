-- One functional work sample per remaining department (Engineering + General
-- already seeded in 0014). Idempotent: each inserts only if its title is absent.

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$PRD from a one-line ask$ws$, (SELECT id FROM departments WHERE name='Product' LIMIT 1), 'Mid', 45,
$ws$A stakeholder sends you a one-line request: "We should let users share reports with people outside the company." In 45 minutes, turn it into a crisp product spec. Cover: the real problem and who has it, the goal and how you would measure success, the scope for a first version, what is explicitly out of scope, the main tradeoffs and risks, and open questions. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Frames the underlying problem rather than restating the request; makes explicit tradeoffs; defines success and a sensible first-version scope; resists scope creep and names real risks.$ws$,
$ws$Uses AI to pressure-test the spec and surface edge cases, while keeping the prioritization and judgment calls their own.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$PRD from a one-line ask$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Critique and redesign a flow$ws$, (SELECT id FROM departments WHERE name='Design' LIMIT 1), 'Mid', 45,
$ws$Below is a described sign-up flow for a mobile app. In 45 minutes: (1) list the friction points and why they hurt, (2) propose a better flow step by step, and (3) explain the reasoning behind your key changes. You may use any AI tools.

Current flow: Landing screen, then "Create account", which asks for email, password, company name, role, team size, and phone number all on one screen, then an email verification code, then a six-screen product tour, and finally an empty home screen with no data and no clear first action.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Identifies the real friction (heavy first form, forced long tour, empty first run), proposes a coherent improved flow, and grounds each change in user needs; addresses the empty-state first action.$ws$,
$ws$Uses AI to generate and compare alternative flows, then exercises taste in choosing and refining rather than accepting the first idea.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Critique and redesign a flow$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Launch one-pager$ws$, (SELECT id FROM departments WHERE name='Marketing' LIMIT 1), 'Mid', 40,
$ws$A new feature is shipping: "Scheduled Reports" lets customers have any dashboard emailed to them or their team on a daily or weekly schedule. In 40 minutes, draft a go-to-market one-pager: the target audience, the core positioning and top three messages, the launch channels, and a headline plus a short announcement paragraph. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Sharp positioning tied to a real audience need, clear and non-generic messaging, a concrete channel plan, and a compelling headline; the announcement is tight, not fluffy.$ws$,
$ws$Uses AI to draft and vary copy, then edits hard for voice and cuts filler rather than shipping raw output.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Launch one-pager$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Discovery and tailored pitch$ws$, (SELECT id FROM departments WHERE name='Sales' LIMIT 1), 'Mid', 45,
$ws$You have a first call with a mid-size company that signed up for a free trial of your analytics product but has not invited their team or connected any data. In 45 minutes, produce: (1) the discovery questions you would ask and why, (2) a short tailored pitch based on the most likely needs, and (3) how you would handle the objection "we already have dashboards in a tool we pay for." You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Questions uncover real needs and buying context; the pitch maps specific benefits to those needs; the objection response reframes value credibly without being pushy.$ws$,
$ws$Uses AI to research and personalize quickly, while keeping claims accurate and grounded in the scenario.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Discovery and tailored pitch$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Angry customer and root cause$ws$, (SELECT id FROM departments WHERE name='Customer Success' LIMIT 1), 'Mid', 35,
$ws$A customer sends this ticket: "This is the third time this week your product logged me out in the middle of a presentation to my board. This is embarrassing and I am now seriously considering canceling." In 35 minutes: (1) write your reply to the customer, and (2) write a short internal root-cause and prevention note for the team. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Reply is empathetic, takes ownership, and gives a concrete next step without over-promising; the internal note proposes a plausible root cause and a real prevention step; keeps the customer tone distinct from the internal analysis.$ws$,
$ws$Uses AI to draft a calm, on-brand reply, then checks the facts and adapts the tone to the severity.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Angry customer and root cause$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Draft a policy from a fuzzy ask$ws$, (SELECT id FROM departments WHERE name='People / HR' LIMIT 1), 'Mid', 40,
$ws$Leadership says: "We want a clear policy on using AI tools at work. We want people to use them, but safely." In 40 minutes, draft a clear, fair one-page policy: what is encouraged, what is not allowed, how to handle sensitive or customer data, and who to ask when unsure. Note any edge cases and open questions you would want leadership to decide. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Policy is clear, practical, and fair; encourages good use while drawing sensible lines on data and confidentiality; anticipates edge cases and flags what needs a leadership decision rather than guessing.$ws$,
$ws$Uses AI to draft and stress-test the policy for unintended consequences, while keeping judgment on fairness and tone.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Draft a policy from a fuzzy ask$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$Model a build-vs-buy decision$ws$, (SELECT id FROM departments WHERE name='Finance / G&A' LIMIT 1), 'Senior', 45,
$ws$Your company needs a customer-support help-desk tool. Buying a SaaS tool costs about $40 per agent per month for 25 agents. Building an in-house version would take roughly two engineers for four months (fully-loaded cost about $15,000 per engineer-month), plus ongoing maintenance. In 45 minutes: build a simple model comparing build vs buy over three years, state your assumptions clearly, recommend a path, and note what would change your recommendation. You may use any AI tools.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Model is sound and the math is right; assumptions are explicit and reasonable (maintenance, opportunity cost, growth); clear recommendation with the key sensitivities named.$ws$,
$ws$Uses AI to set up the model and check the arithmetic, while owning the assumptions and the final call.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$Model a build-vs-buy decision$ws$);

INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active)
SELECT $ws$From messy data to a decision$ws$, (SELECT id FROM departments WHERE name='Analytics' LIMIT 1), 'Mid', 45,
$ws$A product manager asks: "Did the new onboarding checklist we launched last month actually improve activation?" You are given the summary below. In 45 minutes: (1) say what you can and cannot conclude from this, (2) list what you would check for data quality or bias before trusting it, and (3) recommend the analysis you would run to answer the question properly. You may use any AI tools.

What you have: activation rate was 41% the month before launch and 46% the month after; the checklist was shown to all new users; marketing also ran a large campaign that same month; "activation" means completing three key actions in the first week; sample sizes are about 5,000 users per month.$ws$,
$ws$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$ws$,
$ws$Recognizes the confound (simultaneous campaign) and that this is not a clean experiment; lists real data-quality and bias checks; proposes a sound approach (cohort, holdout, or regression) rather than declaring victory from the five-point lift.$ws$,
$ws$Uses AI to reason about study design and check its own logic, without overclaiming a causal result the data cannot support.$ws$,
'Live', 1, true
WHERE NOT EXISTS (SELECT 1 FROM assessment_tasks WHERE title = $ws$From messy data to a decision$ws$);
