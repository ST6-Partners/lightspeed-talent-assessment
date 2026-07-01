-- Seed the fleshed-out work samples (3 General + 3 Engineering) + one example
-- assignment, so the Task Library shows content on deploy. Guarded/idempotent.
DO $mig$
BEGIN
IF (SELECT count(*) FROM assessment_tasks) = 0 THEN
INSERT INTO assessment_tasks (title, department_id, difficulty, time_limit_min, brief, show_your_work_instructions, scoring_guide_work, scoring_guide_ai, status, version, active) VALUES
($b$Ambiguous problem breakdown$b$, NULL, 'Mid', 45,
$b$A regional coffee chain (40 stores) has seen same-store sales fall about 8% over the last two quarters, while the overall market has been flat. Leadership disagrees on why: some blame pricing, some a new competitor, some staff turnover.

You have 45 minutes and only the messy information below. You may use any AI tools.

Produce three things:
1. Your best read on the most likely drivers of the decline, and why.
2. What additional data you would want, and what question each piece would answer.
3. A concrete 90-day action plan.

What you know (incomplete and unaudited):
- Foot traffic is down ~3%; average purchase amount is down ~5%.
- A competitor opened near 12 of the 40 stores about 5 months ago.
- Glassdoor rating fell from 4.1 to 3.4 over the last year.
- Loyalty-app signups are up ~20%.
- Two of three regions declined; one was flat.
- Bean costs rose ~15% and were passed through to prices in month 3.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Separates likely drivers from noise and uses the actual data given (not a generic answer). Prioritizes the plan, ties each data request to a decision, and names the biggest uncertainties.$b$,
$b$Uses AI to structure the analysis and test competing explanations, but checks conclusions against the specific numbers provided and pushes past the first draft.$b$,
'Live', 1, true),

($b$Make sense of conflicting information$b$, NULL, 'Mid', 45,
$b$You are advising a leadership team deciding whether to move to a 4-day work week. The inputs below partly contradict each other.

In 45 minutes, produce a one-page recommendation: your call, your reasoning, where the evidence conflicts and how you weighed it, and the single biggest risk. You may use any AI tools.

Inputs (each is partial and none is authoritative):
- Internal pulse survey: 78% of staff want it; open comments mention burnout.
- A manager memo worries customer response times will slip on the off day.
- External study A (tech firms): productivity roughly held, attrition dropped.
- External study B (call centers): output per week fell ~10% on a 4-day schedule.
- Finance note: payroll unchanged, but overtime rose in a small pilot.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Reconciles the conflicts explicitly instead of cherry-picking, weighs source quality, lands on a clear and defensible recommendation, and surfaces the real risk.$b$,
$b$Uses AI to synthesize and pressure-test the argument, and catches where AI over-generalizes beyond the specific inputs provided.$b$,
'Live', 1, true),

($b$Learn something new, fast$b$, NULL, 'Mid', 45,
$b$This measures how quickly and accurately you can get up to speed on something unfamiliar. Topic: how carbon-offset credits are verified.

In 45 minutes, using the reference material below and any AI tools, produce (a) a clear one-page explainer for a smart non-expert, and (b) short answers to the three questions at the end.

Reference material (treat as the source of truth for this task):
- A carbon credit represents one tonne of CO2 avoided or removed. Projects are validated against a standard (e.g. Verra, Gold Standard).
- Additionality means the reduction would not have happened without the credit revenue. Weak additionality is the main criticism of offsets.
- Credits are verified by accredited third-party auditors before issuance, and re-verified periodically. Retiring a credit means it can no longer be resold.

Questions:
1. Why is additionality so central to whether a credit is trustworthy?
2. What is the difference between issuing and retiring a credit?
3. Name one reason a buyer might still distrust a verified credit.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Explainer is accurate, clear, and well organized for the audience; the three answers are correct and grounded in the material; flags anything uncertain rather than bluffing.$b$,
$b$Uses AI to accelerate learning and check understanding, and verifies claims against the provided material rather than trusting the model prior knowledge.$b$,
'Live', 1, true),

($b$Debug and extend a feature$b$, (SELECT id FROM departments WHERE name = 'Engineering' LIMIT 1), 'Mid', 60,
$b$You have inherited a small to-do list API service. A working repository and its test suite are provided when you begin.

It has one known bug and one missing feature. In 60 minutes, using any AI tools:
1. Bug: the endpoint that marks an item complete sometimes updates the WRONG item. Find and fix it.
2. Feature: add a filter so the list endpoint can return only open items or only done items.

Make the existing tests pass and do not break anything else. When finished, submit your changed files and complete the show-your-work section.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Bug correctly diagnosed and fixed; the filter works and handles a bad status value sensibly; existing tests still pass; code is clean and readable.$b$,
$b$Uses AI to locate the bug and scaffold the feature quickly, but verifies the result rather than pasting code that merely looks right.$b$,
'Live', 1, true),

($b$Build a small feature from a spec$b$, (SELECT id FROM departments WHERE name = 'Engineering' LIMIT 1), 'Mid', 60,
$b$A short spec and a starter repository are provided when you begin. In 60 minutes, implement the feature with passing tests, using any AI tools.

Spec — add an order summary endpoint. Given a list of line items (each with a unit price and a quantity), return:
- subtotal (sum of price x quantity),
- a volume discount: 5% off if subtotal is over $500, 10% off if over $1000,
- tax applied to the discounted amount at a rate supplied in the request,
- the final total.

Handle empty input and invalid quantities (zero or negative) gracefully rather than crashing. Complete show-your-work when done.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Calculations correct, including discount tiers and discount-then-tax order; edge cases handled cleanly; includes tests; code is clear.$b$,
$b$Uses AI to scaffold the endpoint and tests, but personally verifies the tricky discount/tax logic.$b$,
'Live', 1, true),

($b$Code review and refactor$b$, (SELECT id FROM departments WHERE name = 'Engineering' LIMIT 1), 'Senior', 45,
$b$Below is a function that works most of the time but is hard to maintain and has a subtle correctness problem. In 45 minutes, using any AI tools:
1. List the problems you see (correctness, readability, safety).
2. Provide a refactored version.
3. Briefly explain your key decisions and any trade-offs.

Code under review:

  function calc(items, u) {
    var t = 0;
    for (var i = 0; i <= items.length; i++) {
      if (items[i].type == 'A') { t = t + items[i].v * 1.2; }
      else { if (items[i].type == 'B') t += items[i].v; }
    }
    if (u == true) { return t * 0.9; } else { return t; }
  }

Complete show-your-work when done.$b$,
$b$Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right.$b$,
$b$Catches the real issues — including the off-by-one loop bound and the unhandled type cases — produces a clean, well-named refactor, and explains trade-offs clearly.$b$,
$b$Uses AI to help spot issues and refactor, while exercising judgment about which suggestions to accept.$b$,
'In Review', 1, true);
END IF;

IF (SELECT count(*) FROM assessment_packages) = 0 THEN
INSERT INTO assessment_packages (name, department_id, general_task_id, functional_task_id, status, version, active) VALUES
($b$Engineering assessment$b$,
 (SELECT id FROM departments WHERE name = 'Engineering' LIMIT 1),
 (SELECT id FROM assessment_tasks WHERE title = 'Ambiguous problem breakdown' LIMIT 1),
 (SELECT id FROM assessment_tasks WHERE title = 'Debug and extend a feature' LIMIT 1),
 'Draft', 1, true);
END IF;
END $mig$;
