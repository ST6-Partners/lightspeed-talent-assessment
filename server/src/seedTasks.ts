// ============================================================
// ASSESSMENT TASK LIBRARY SEED
// Full work-sample content for the General baseline pool (3) and
// the Engineering pool (3), plus one placeholder per remaining
// department. scope = department name, or 'General' for everyone.
// Runs after seedDepartments (needs department ids).
//
// Scoring guides here are CONTENT (what "good" looks like). The
// scoring ENGINE / test harness is a separate future build.
//
// Run standalone:  npm run db:seed:tasks
// Re-seed (wipe):  RESEED=1 npm run db:seed:tasks
// Idempotent: skips if tasks already exist unless RESEED=1.
// ============================================================

import { db } from './db.js';
import { assessmentTasks } from './db/schema/assessmentTasks.js';
import { departments } from './db/schema/departments.js';
import { sql } from 'drizzle-orm';

type Difficulty = 'Entry' | 'Mid' | 'Senior';
type Status = 'Draft' | 'In Review' | 'Live' | 'Retired';

interface TaskDef {
  title: string;
  scope: string; // 'General' or a department name
  difficulty: Difficulty;
  timeLimitMin: number;
  status: Status;
  brief: string;
  scoringGuideWork: string;
  scoringGuideAi: string;
}

const SHOW_YOUR_WORK =
  `Show your work. Paste the key prompts you used, anything you tried that did not work, and how you checked that your answer was right. We care as much about how you got there as about the final result.`;

const TASKS: TaskDef[] = [
  // ── GENERAL POOL (baseline — everyone gets one of these) ──
  {
    title: 'Ambiguous problem breakdown',
    scope: 'General', difficulty: 'Mid', timeLimitMin: 45, status: 'Live',
    brief:
`A regional coffee chain (40 stores) has seen same-store sales fall about 8% over the last two quarters, while the overall market has been flat. Leadership disagrees on why: some blame pricing, some a new competitor, some staff turnover.

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
- Bean costs rose ~15% and were passed through to prices in month 3.`,
    scoringGuideWork:
`Separates likely drivers from noise and uses the ACTUAL data given (not a generic "here's how to think about sales declines"). Prioritizes the plan, ties each data request to a decision, and names the biggest uncertainties. Reasoning is internally consistent.`,
    scoringGuideAi:
`Uses AI to structure the analysis and test competing explanations, but does not accept a generic AI answer — checks conclusions against the specific numbers provided and pushes past the first draft.`,
  },
  {
    title: 'Make sense of conflicting information',
    scope: 'General', difficulty: 'Mid', timeLimitMin: 45, status: 'Live',
    brief:
`You are advising a leadership team deciding whether to move to a 4-day work week. The inputs below partly contradict each other.

In 45 minutes, produce a one-page recommendation: your call, your reasoning, where the evidence conflicts and how you weighed it, and the single biggest risk. You may use any AI tools.

Inputs (each is partial and none is authoritative):
- Internal pulse survey: 78% of staff want it; open comments mention burnout.
- A manager memo worries customer response times will slip on the off day.
- External study A (tech firms): productivity roughly held, attrition dropped.
- External study B (call centers): output per week fell ~10% on a 4-day schedule.
- Finance note: payroll unchanged, but overtime rose in a small pilot.`,
    scoringGuideWork:
`Reconciles the conflicts explicitly instead of cherry-picking, weighs the quality/relevance of each source, lands on a clear and defensible recommendation, and surfaces the real risk rather than a token one.`,
    scoringGuideAi:
`Uses AI to synthesize and pressure-test the argument, and catches where AI over-generalizes beyond the specific inputs provided.`,
  },
  {
    title: 'Learn something new, fast',
    scope: 'General', difficulty: 'Mid', timeLimitMin: 45, status: 'Live',
    brief:
`This measures how quickly and accurately you can get up to speed on something unfamiliar. Topic: how carbon-offset credits are verified.

In 45 minutes, using the reference material below and any AI tools, produce (a) a clear one-page explainer for a smart non-expert, and (b) short answers to the three questions at the end.

Reference material (treat as the source of truth for this task):
- A carbon credit represents one tonne of CO2 avoided or removed. Projects are validated against a "standard" (e.g. Verra, Gold Standard).
- "Additionality" means the reduction would not have happened without the credit revenue. Weak additionality is the main criticism of offsets.
- Credits are verified by accredited third-party auditors before issuance, and projects are periodically re-verified. "Retiring" a credit means it can no longer be resold.

Questions:
1. Why is additionality so central to whether a credit is trustworthy?
2. What is the difference between issuing and retiring a credit?
3. Name one reason a buyer might still distrust a "verified" credit.`,
    scoringGuideWork:
`Explainer is accurate, clear, and well organized for the stated audience; the three answers are correct and grounded in the material; the candidate flags anything they are unsure about rather than bluffing.`,
    scoringGuideAi:
`Uses AI to accelerate learning and check understanding, and verifies claims against the PROVIDED material rather than trusting the model's own prior knowledge.`,
  },

  // ── ENGINEERING POOL ──
  {
    title: 'Debug and extend a feature',
    scope: 'Engineering', difficulty: 'Mid', timeLimitMin: 60, status: 'Live',
    brief:
`You have inherited a small to-do list API service. A working repository and its test suite are provided when you begin.

It has one known bug and one missing feature. In 60 minutes, using any AI tools:
1. Bug: the endpoint that marks an item complete sometimes updates the WRONG item. Find and fix it.
2. Feature: add a filter so the list endpoint can return only open items or only done items.

Make the existing tests pass and do not break anything else. When finished, submit your changed files and complete the "show your work" section.`,
    scoringGuideWork:
`Bug correctly diagnosed and fixed; the filter works and handles a bad status value sensibly; existing tests still pass; code changes are clean and readable with no leftover clutter.`,
    scoringGuideAi:
`Uses AI to locate the bug and scaffold the feature quickly, but verifies the result (runs the tests, reasons about the fix) rather than pasting in code that merely looks right.`,
  },
  {
    title: 'Build a small feature from a spec',
    scope: 'Engineering', difficulty: 'Mid', timeLimitMin: 60, status: 'Live',
    brief:
`A short spec and a starter repository are provided when you begin. In 60 minutes, implement the feature with passing tests, using any AI tools.

Spec — add an "order summary" endpoint. Given a list of line items (each with a unit price and a quantity), return:
- subtotal (sum of price x quantity),
- a volume discount: 5% off if subtotal is over $500, 10% off if over $1000,
- tax applied to the discounted amount at a rate supplied in the request,
- the final total.

Handle empty input and invalid quantities (zero or negative) gracefully rather than crashing. Complete "show your work" when done.`,
    scoringGuideWork:
`Calculations are correct, including the discount tiers and the order of discount-then-tax; edge cases (empty list, bad quantities) handled cleanly; includes tests; code is clear.`,
    scoringGuideAi:
`Uses AI to scaffold the endpoint and tests, but personally verifies the tricky discount/tax logic instead of trusting the first generated version.`,
  },
  {
    title: 'Code review and refactor',
    scope: 'Engineering', difficulty: 'Senior', timeLimitMin: 45, status: 'In Review',
    brief:
`Below is a function that works most of the time but is hard to maintain and has a subtle correctness problem. In 45 minutes, using any AI tools:
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

Complete "show your work" when done.`,
    scoringGuideWork:
`Catches the real issues — including the off-by-one loop bound (i <= length) and the unhandled/other type cases — produces a clean, well-named, safer refactor, and explains trade-offs clearly.`,
    scoringGuideAi:
`Uses AI to help spot issues and refactor, while exercising judgment about which AI suggestions to accept and which to reject.`,
  },

  // ── PLACEHOLDERS — one per remaining department (to be fleshed out) ──
  { title: 'PRD from a one-line ask', scope: 'Product', difficulty: 'Mid', timeLimitMin: 45, status: 'Draft',
    brief: 'Placeholder — turn a one-line feature request into a crisp spec with tradeoffs. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Critique and redesign a flow', scope: 'Design', difficulty: 'Mid', timeLimitMin: 45, status: 'Draft',
    brief: 'Placeholder — critique a described user flow and propose a better one. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Launch one-pager', scope: 'Marketing', difficulty: 'Entry', timeLimitMin: 40, status: 'Draft',
    brief: 'Placeholder — draft a go-to-market one-pager for a fictional feature. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Discovery and tailored pitch', scope: 'Sales', difficulty: 'Mid', timeLimitMin: 45, status: 'Draft',
    brief: 'Placeholder — write discovery questions and a tailored pitch for a prospect scenario. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Angry-customer response and root cause', scope: 'Customer Success', difficulty: 'Entry', timeLimitMin: 30, status: 'Draft',
    brief: 'Placeholder — respond to an angry ticket and write a short root-cause summary. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Draft a policy from a fuzzy ask', scope: 'People / HR', difficulty: 'Mid', timeLimitMin: 40, status: 'Draft',
    brief: 'Placeholder — draft a clear, fair policy from a vague leadership ask. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
  { title: 'Model a quick decision', scope: 'Finance / G&A', difficulty: 'Senior', timeLimitMin: 45, status: 'Draft',
    brief: 'Placeholder — model a simple build-vs-buy decision and recommend, stating assumptions. Full content to be written.',
    scoringGuideWork: 'To be written.', scoringGuideAi: 'To be written.' },
];

export async function seedTasks() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(assessmentTasks);
  const have = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;

  if (have && !reseed) {
    console.log(`  [tasks] ${existing[0].n} tasks already present — skipping (RESEED=1 to wipe & reseed).`);
    return;
  }
  if (have && reseed) {
    console.log('  [tasks] RESEED=1 — clearing assessment_tasks...');
    await db.delete(assessmentTasks);
  }

  const depts = await db.select().from(departments);
  const byName = new Map(depts.map((d) => [d.name, d.id]));

  for (const t of TASKS) {
    const departmentId = t.scope === 'General' ? null : (byName.get(t.scope) ?? null);
    if (t.scope !== 'General' && !departmentId) {
      console.warn(`  [tasks] WARNING: department "${t.scope}" not found — seeding "${t.title}" as General.`);
    }
    await db.insert(assessmentTasks).values({
      title: t.title,
      departmentId,
      difficulty: t.difficulty,
      timeLimitMin: t.timeLimitMin,
      brief: t.brief,
      showYourWorkInstructions: SHOW_YOUR_WORK,
      scoringGuideWork: t.scoringGuideWork,
      scoringGuideAi: t.scoringGuideAi,
      status: t.status,
      version: 1,
      active: true,
    });
  }
  console.log(`  [tasks] Seeded ${TASKS.length} assessment tasks (3 General + 3 Engineering fleshed out; 7 placeholders).`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedTasks()
    .then(() => { console.log('Tasks seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Tasks seed failed:', err); process.exit(1); });
}
