-- 0019_refresh_work_samples.sql
-- Redesign the work samples so each one imitates the real day-to-day deliverable
-- of the role (real setup, real messy inputs, the real artifact) instead of a
-- generic word problem. Updates rows IN PLACE so task IDs, package links, JD
-- links, and candidate-session references are all preserved. Idempotent.
-- Source: 2-Design/Work Samples - Redesign for Role Realism v1 (07-02-26-jof).

-- ============ GENERAL POOL (baseline - everyone gets one) ============

UPDATE assessment_tasks SET
  title = 'Make sense of a forwarded mess',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$It's your second week. Your manager forwards you a thread and writes: "Can you take a look and tell me what you think is going on and what we should do? I need to say something in the leadership sync tomorrow at 10."

The thread (lightly cleaned up):

- Ops lead -> your manager: "Heads up - our monthly active accounts are down ~8% since March and I'm getting questions. Not sure if it's real or a reporting thing."
- Data analyst (reply-all): "The dashboard change on Mar 12 changed how we count 'active.' Some of the drop is definitely that. Haven't had time to untangle how much."
- Support manager: "FWIW our ticket volume is up and CSAT dipped from 4.4 to 4.0 last quarter. Could be related, could be seasonal."
- Sales director: "We also lost two biggish logos in Q1 to a competitor. That alone is a chunk of the number."

Write the reply you'd send your manager - something they could half-paste into the leadership sync. Cover: your best read on what's real vs. noise, what you'd want to confirm and who you'd ask, and what you'd actually do next.

You have 45 minutes and may use any AI tools.$ws$,
  scoring_guide_work = $ws$Separates the reporting artifact (the Mar 12 definition change) from real signal; doesn't treat all four inputs as equally trustworthy; gives a clear "here's what I think and my confidence" rather than hedging; proposes a next step that would actually resolve the uncertainty. Written like a message to a manager, not an essay.$ws$,
  scoring_guide_ai = $ws$Uses AI to structure the read and stress-test explanations, but doesn't accept a generic "how to analyze a metric drop" answer - anchors on the specific thread and flags what can't be concluded from it.$ws$
WHERE title = 'Ambiguous problem breakdown';

UPDATE assessment_tasks SET
  title = 'Make the call when the inputs disagree',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$A lead asks you to weigh in on a real decision: should we move the team to a 4-day work week for a 3-month trial? They want a short recommendation they can forward - "your call, your reasoning, the one risk that would change your mind."

What's floating around (none of it authoritative, some of it conflicting):

- Internal pulse: 78% of staff want it; free-text comments mention burnout and "meeting overload."
- A team-lead memo worries customer response times slip on the off day.
- Write-up A (from a tech company's trial): output roughly held, attrition dropped.
- Write-up B (from a support-heavy org): weekly output fell ~10% on 4 days.
- Finance note: payroll unchanged, but overtime ticked up in a small pilot.

Write the one-page recommendation. 45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Actually reconciles the conflict (e.g., notices the two write-ups differ because the work is differently interruptible) instead of cherry-picking; weighs source relevance; lands on a clear, defensible call; names a real risk and what signal would flip the decision.$ws$,
  scoring_guide_ai = $ws$Uses AI to synthesize and pressure-test, and catches where AI over-generalizes past the specific inputs.$ws$
WHERE title = 'Make sense of conflicting information';

UPDATE assessment_tasks SET
  title = 'Get up to speed and brief the team',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$You've been asked to become the team's go-to on an unfamiliar topic and post a short explainer in the team wiki by end of day, so nobody else has to figure it out from scratch. Topic: how carbon-offset credits are verified. (The topic is deliberately outside most people's expertise - the point is watching you ramp, not what you already know.)

Use the reference notes below as your source of truth, plus any AI tools. Produce (a) a clear one-page wiki explainer for smart non-experts, and (b) crisp answers to the three FAQ questions at the end.

Reference notes (treat as the source of truth):
- A carbon credit represents one tonne of CO2 avoided or removed. Projects are validated against a "standard" (e.g. Verra, Gold Standard).
- "Additionality" means the reduction would not have happened without the credit revenue. Weak additionality is the main criticism of offsets.
- Credits are verified by accredited third-party auditors before issuance, and projects are periodically re-verified. "Retiring" a credit means it can no longer be resold.

Questions:
1. Why is additionality so central to whether a credit is trustworthy?
2. What is the difference between issuing and retiring a credit?
3. Name one reason a buyer might still distrust a "verified" credit.

45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Explainer is accurate, well-organized for the stated audience, and reads like an internal doc someone would actually use; the three answers are correct and grounded in the provided notes; the candidate flags uncertainty rather than bluffing.$ws$,
  scoring_guide_ai = $ws$Uses AI to learn fast and check understanding, and verifies against the provided notes rather than trusting the model's own prior knowledge.$ws$
WHERE title = 'Learn something new, fast';

-- ============ FUNCTIONAL POOL (one flagship per department) ============

-- Engineering
UPDATE assessment_tasks SET
  title = 'Inherit a repo: fix a bug, ship a feature, open a PR',
  difficulty = 'Mid', time_limit_min = 60, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$You've just been added to a small service's repo. Clone it, get the test suite running, and work the way you would on your first ticket.

There's one bug and one small feature in the issue tracker:

1. Bug: "Marking a to-do complete sometimes flips the wrong item." Reproduce it, find the root cause, fix it.
2. Feature: add a filter so the list endpoint can return only open or only done items (and behaves sensibly on a bad filter value).

Keep the existing tests green, add tests for your changes, and open a pull request the way you would for a teammate to review - a clear title, a description of what you changed and why, and how you verified it.

60 minutes, any AI tools. A working repo and its test suite are provided when you begin.$ws$,
  scoring_guide_work = $ws$Bug correctly diagnosed and fixed (not just symptom-patched); filter works and handles bad input; tests pass and new tests are meaningful; the PR reads like something a reviewer could approve - clean diff, clear description, no leftover clutter.$ws$,
  scoring_guide_ai = $ws$Uses AI to navigate unfamiliar code and scaffold fast, but verifies (runs tests, reasons about the fix) instead of pasting code that merely looks right. Show-your-work reveals real debugging, not vibe-coding.$ws$
WHERE title = 'Debug and extend a feature';

-- Product
UPDATE assessment_tasks SET
  title = 'Turn a messy request into a spec and make the priority call',
  difficulty = 'Mid', time_limit_min = 60, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$Three things landed in your inbox this week, all pointing at roughly the same area but asking for different things:

- Slack from the CEO: "Customers keep asking for a dark mode - can we just knock this out?"
- Sales escalation: "I'm going to lose the BigCo renewal unless we can give them SSO. They asked three times."
- Support digest: top ticket driver this month is people unable to find the export button; 140 tickets.

You have eng capacity for one of these next sprint. Write:

(a) a one-page PRD for the one you'd pick - problem, who it's for, what "done" looks like, how you'd measure it, and what's explicitly out of scope; and
(b) a short note to the CEO explaining what you're doing first and why the other two are waiting.

60 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Makes a defensible prioritization call using impact/effort/strategic reasoning (not just "the CEO said so"); the PRD is crisp and testable with a real success metric and clear non-goals; the CEO note manages up honestly and briefly.$ws$,
  scoring_guide_ai = $ws$Uses AI to draft and sharpen the PRD, but the prioritization judgment and trade-off reasoning are clearly the candidate's, not a generic AI framework dump.$ws$
WHERE title = 'PRD from a one-line ask';

-- Design
UPDATE assessment_tasks SET
  title = 'Critique a flow and redesign it',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$Here's the current sign-up flow for a B2B app, screen by screen:

1. Email + password
2. "Verify your email" (must leave and click a link)
3. Company name + size + role (6 fields)
4. "Invite your team" (required, minimum 1)
5. Empty dashboard

What we know: 40% of people who start never reach the dashboard; the biggest single drop-off is screen 4; three users said in interviews "I just wanted to look around first before inviting anyone."

Produce what you'd bring to a design review:
(a) a short critique - what's wrong and why, prioritized;
(b) a redesigned flow, screen by screen (a written wireframe is fine - describe each screen and the key elements); and
(c) the rationale tying each change to the problem.

45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Diagnoses the real friction (forced team-invite before value, verification interrupt, heavy form) and prioritizes by impact; the redesign is concrete and plausibly reduces the measured drop-off; rationale connects decisions to the evidence, not to generic "best practices."$ws$,
  scoring_guide_ai = $ws$Uses AI to generate and critique options, but exercises design judgment about which suggestions actually fit the stated users and data.$ws$
WHERE title = 'Critique and redesign a flow';

-- Marketing
UPDATE assessment_tasks SET
  title = 'Launch the feature: announcement + channel plan',
  difficulty = 'Entry', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$A PM drops this in your channel: "We're shipping Scheduled Reports in two weeks - users can now get any dashboard emailed to them on a schedule. Can you handle the launch?" That's all you get.

Produce the launch kit:
(a) the announcement copy (a short blog post or customer email - your call, say which and why);
(b) a one-paragraph positioning line (who it's for, the pain it removes, the payoff); and
(c) a lightweight launch plan - which 3 channels, the core message for each, and the one metric you'd judge success by.

45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Positioning leads with customer value, not feature mechanics; copy is clear, on-benefit, and audience-appropriate; the plan is realistic and picks a sensible single success metric; makes and justifies the blog-vs-email call.$ws$,
  scoring_guide_ai = $ws$Uses AI to draft variations and tighten copy, but the positioning angle and channel judgment are the candidate's; catches generic AI marketing filler.$ws$
WHERE title = 'Launch one-pager';

-- Sales
UPDATE assessment_tasks SET
  title = 'Work the inbound: call plan, follow-up, deal notes',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$An inbound lead came in. Here's what you've got:

- Company: mid-size logistics firm, ~600 employees, growing fast.
- Form they filled out: "We're drowning in manual reporting across 4 systems and our ops team is stretched. Evaluating options this quarter."
- Their title: VP Operations.

Part 1 - before the call: write your discovery call plan - the questions you'd ask (and, in a word, what each is trying to uncover), plus what you'd want to be true to know this is a real deal.

Part 2 - after the call: below is a short transcript excerpt (they confirm the pain, mention a competitor they're also evaluating, and hint at a Q3 budget and a CFO who signs off). Write the follow-up email you'd send, and a few lines of internal deal notes (what you learned, the risks, the next step).

45 minutes, any AI tools. Optional add-on: record a 5-minute mock discovery call instead of Part 1 if you prefer.$ws$,
  scoring_guide_work = $ws$Discovery questions are open, prioritized, and tied to real qualification (pain, budget, authority, competition, timeline) rather than a generic script; the follow-up is personalized to what was actually said and drives a clear next step; deal notes are honest about risk.$ws$,
  scoring_guide_ai = $ws$Uses AI to prep and polish, but the qualification instinct and read on the deal are the candidate's; the follow-up doesn't sound like a mail-merge template.$ws$
WHERE title = 'Discovery and tailored pitch';

-- Customer Success
UPDATE assessment_tasks SET
  title = 'Save the at-risk account',
  difficulty = 'Mid', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$One of your accounts is wobbling. What you have:

- Email from the customer's admin: "Honestly we're not seeing the value we expected. Half my team stopped logging in. We renew in 60 days and I need to justify this internally."
- Usage data: logins down 45% over 8 weeks; only 2 of 12 seats active; they've never used the reporting feature they bought it for.
- History: onboarded 7 months ago, no QBR has happened.

Produce:
(a) the reply to the customer - steady, specific, not defensive, with a concrete next step; and
(b) an internal save plan - your read on why they're at risk, what you'd do in the next 30 days, and the one thing that most needs to change to earn the renewal.

45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$The customer reply rebuilds trust with specifics (not platitudes) and proposes a real path to value; the internal plan correctly reads the root cause (bought reporting, never adopted it; no QBR; low activation) and sequences a credible save; distinguishes what's in the CSM's control.$ws$,
  scoring_guide_ai = $ws$Uses AI to draft the reply and structure the plan, but the empathy calibration and root-cause read are the candidate's; the email doesn't read as canned.$ws$
WHERE title = 'Angry customer and root cause';

-- People / HR
UPDATE assessment_tasks SET
  title = 'Turn a vague ask into a clear, fair policy',
  difficulty = 'Mid', time_limit_min = 40, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$An exec messages you: "We need an AI-use policy for the company - people are pasting stuff into ChatGPT and I don't know what's okay. Can you draft something? Keep it human, not a legal wall." Two managers have already weighed in, and they disagree:

- Manager A: "Just ban external AI tools for anything with customer data, full stop."
- Manager B: "If we lock it down people will route around it - we should enable it with guardrails."

Produce:
(a) the policy - clear, fair, and specific enough to actually follow (what's encouraged, what's not allowed, the grey-area rule, and where to ask); and
(b) a short rollout note - how you'd announce it so people read it and don't panic.

40 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Balances the two manager views into a workable position rather than picking a side or going vague; the policy handles the real edge cases (customer data, PII, what "okay" looks like) and is genuinely readable; the rollout note anticipates how people will react.$ws$,
  scoring_guide_ai = $ws$Uses AI to draft and sanity-check coverage, but the judgment on where to draw lines is the candidate's; avoids a generic boilerplate policy that ignores the specific tension.$ws$
WHERE title = 'Draft a policy from a fuzzy ask';

-- Finance / G&A
UPDATE assessment_tasks SET
  title = 'Model the decision and recommend',
  difficulty = 'Senior', time_limit_min = 45, status = 'Live', version = 2, active = true, updated_at = now(),
  brief = $ws$Leadership is deciding: build an internal reporting tool, or buy a SaaS one? They want a simple model and a recommendation by tomorrow. The numbers are scattered and some are assumptions you'll have to make (and state):

- Buy: vendor quote ~$4,000/month, ~6 weeks to roll out, minimal internal effort.
- Build: needs ~1.5 engineers for ~4 months, then ~0.25 an engineer ongoing to maintain. Assume a loaded engineer cost yourself and say what you assumed.
- Context: leadership thinks of this as a "3-year" decision. Soft factor - building means it fits exactly; buying means faster and less risk.

Produce:
(a) a simple model (a small table is fine) comparing the two over a sensible horizon with your assumptions listed;
(b) a recommendation with the reasoning; and
(c) the one number leadership will fixate on and how sensitive it is.

45 minutes, any AI tools.$ws$,
  scoring_guide_work = $ws$Model is set up correctly (comparable horizon, build includes maintenance and ramp, sensible loaded cost); assumptions are explicit and reasonable; the recommendation follows from the math and weighs the soft factors; the candidate knows which input the answer hinges on.$ws$,
  scoring_guide_ai = $ws$Uses AI to build and check the model, but owns the assumptions and catches arithmetic/logic errors instead of trusting the first table the model produces.$ws$
WHERE title = 'Model a build-vs-buy decision';

-- ============ Retire the two extra Engineering tasks (kept as alternates) ============
UPDATE assessment_tasks SET status = 'Retired', active = false, updated_at = now()
WHERE title IN ('Build a small feature from a spec', 'Code review and refactor');
