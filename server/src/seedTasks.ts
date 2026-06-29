// ============================================================
// ASSESSMENT TASK LIBRARY SEED
// One General baseline task + one starter task per department.
// scope = department name, or 'General' for the everyone task.
// Runs after seedDepartments (needs department ids).
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
  'Paste the prompts you used, what you tried, and anything you rejected along the way. We care about how you got there, not just the final answer.';

const TASKS: TaskDef[] = [
  { title: 'Ambiguous problem breakdown', scope: 'General', difficulty: 'Mid', timeLimitMin: 45, status: 'Live',
    brief: 'You are handed a messy, incomplete business problem. Produce a clear recommendation and a plan to act on it. You may use any AI tools.',
    scoringGuideWork: 'Clear structure, sound logic, a realistic plan, and the key risks named. Conclusions follow from the facts given.',
    scoringGuideAi: 'Steers the tool with good prompts, iterates, checks the output, and does not simply accept the first draft.' },
  { title: 'Debug and extend a feature', scope: 'Engineering', difficulty: 'Mid', timeLimitMin: 60, status: 'Live',
    brief: 'Here is a small feature with a bug and a short spec for an extension. Fix the bug and build the extension. You may use any AI tools.',
    scoringGuideWork: 'Bug correctly fixed, extension works to spec, clean and readable code, sensible edge-case handling.',
    scoringGuideAi: 'Uses AI to locate the bug and scaffold the extension, but verifies the output and does not ship hallucinated code.' },
  { title: 'PRD from a one-line ask', scope: 'Product', difficulty: 'Mid', timeLimitMin: 45, status: 'Live',
    brief: 'Turn a one-line feature request into a crisp product spec: problem, goal, scope, tradeoffs, and success measures.',
    scoringGuideWork: 'Frames the real problem, makes explicit tradeoffs, defines done, and resists scope creep.',
    scoringGuideAi: 'Uses AI to pressure-test the spec and surface edge cases, while keeping the judgment calls their own.' },
  { title: 'Critique and redesign a flow', scope: 'Design', difficulty: 'Mid', timeLimitMin: 45, status: 'Draft',
    brief: 'Given a described user flow, critique it and propose a better one. Explain the reasoning behind each change.',
    scoringGuideWork: 'Identifies real friction, proposes coherent improvements, and grounds choices in user needs.',
    scoringGuideAi: 'Uses AI to generate and compare alternatives, then exercises taste in selecting and refining.' },
  { title: 'Launch one-pager', scope: 'Marketing', difficulty: 'Entry', timeLimitMin: 40, status: 'Live',
    brief: 'Draft a go-to-market one-pager for a fictional feature: audience, message, channels, and a headline.',
    scoringGuideWork: 'Sharp positioning, audience-appropriate message, concrete channel plan, and a compelling headline.',
    scoringGuideAi: 'Uses AI to draft and vary copy, then edits for voice and cuts the filler rather than shipping it raw.' },
  { title: 'Discovery and tailored pitch', scope: 'Sales', difficulty: 'Mid', timeLimitMin: 45, status: 'In Review',
    brief: 'Given a prospect scenario, write the discovery questions you would ask and a short tailored pitch.',
    scoringGuideWork: 'Questions uncover real needs; pitch maps benefits to those needs; tone fits the buyer.',
    scoringGuideAi: 'Uses AI to research and personalize at speed, while keeping claims accurate and grounded.' },
  { title: 'Angry-customer response and root cause', scope: 'Customer Success', difficulty: 'Entry', timeLimitMin: 30, status: 'Live',
    brief: 'Respond to an angry customer ticket and write a short internal root-cause summary of what likely went wrong.',
    scoringGuideWork: 'Empathetic, accurate response that resolves or de-escalates; root cause is plausible and actionable.',
    scoringGuideAi: 'Uses AI to draft a calm, on-brand reply, then checks facts and adapts tone to the situation.' },
  { title: 'Draft a policy from a fuzzy ask', scope: 'People / HR', difficulty: 'Mid', timeLimitMin: 40, status: 'Draft',
    brief: 'Leadership gives a vague ask for a new policy. Draft a clear, fair policy and note open questions for sign-off.',
    scoringGuideWork: 'Clear and fair policy, anticipates edge cases, and flags what needs a human decision.',
    scoringGuideAi: 'Uses AI to draft and stress-test for unintended consequences, while keeping judgment on fairness.' },
  { title: 'Model a quick decision', scope: 'Finance / G&A', difficulty: 'Senior', timeLimitMin: 45, status: 'Draft',
    brief: 'Build a quick analysis of a simple business decision (e.g. build vs. buy). State your assumptions and recommend.',
    scoringGuideWork: 'Sound model, explicit and reasonable assumptions, and a clear recommendation with sensitivities.',
    scoringGuideAi: 'Uses AI to set up the model and check the math, while owning the assumptions and the call.' },
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
  console.log(`  [tasks] Seeded ${TASKS.length} assessment tasks.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedTasks()
    .then(() => { console.log('Tasks seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Tasks seed failed:', err); process.exit(1); });
}
