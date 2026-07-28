// ============================================================
// BIAS / ADVERSE-IMPACT DEMO SEED
//
// Populates the Fairness (four-fifths) audit with enough sample data to
// show real results. The audit suppresses any demographic group with
// fewer than MIN_SAMPLE (30) assessed candidates, so a couple of records
// is not enough — this creates ~144 demo candidates on a dedicated demo
// role, each with an 'assessment_gate' decision + a completed EEO
// self-ID response.
//
// The pass rates are engineered so the audit has something to report:
//   • Sex   — Female pass rate ~0.68x Male  -> Female FLAGGED (Male reference)
//   • Race  — Black pass rate  ~0.66x White -> Black  FLAGGED (White reference)
//   • Every group has >= 30 assessed, so none is suppressed.
//
// Idempotent: skips entirely if demo candidates already exist. Non-fatal
// at boot. All demo rows are tagged (email prefix + demo role) so they
// are trivially removable:
//   DELETE FROM candidates WHERE email LIKE 'demo.bias.%';
//   DELETE FROM job_requisitions WHERE department = 'Demo — Fairness Sandbox';
//
// Run on deploy (boot) automatically, or manually: npm run db:seed:bias
// ============================================================

import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from './db.js';
import { candidates, jobRequisitions, jobDescriptions } from './db/schema/hiring.js';
import { eeoResponses } from './db/schema/eeo.js';
import { logDecision } from './services/decisionLog.js';

const DEMO_REQ_DEPT = 'Demo — Fairness Sandbox';
const DEMO_EMAIL_PREFIX = 'demo.bias.';

// (race, sex) cells with total count + how many "passed" the assessment gate.
// Marginals: Male 73 (80.8% pass), Female 71 (54.9% pass) -> Female flagged.
// Race: White 42 (76.2%), Asian 36 (75.0%), Black 34 (50.0% -> flagged),
// Hispanic 32 (68.8%). All groups >= 30.
const CELLS: { race: string; sex: string; count: number; passed: number }[] = [
  { race: 'White', sex: 'Male', count: 22, passed: 20 },
  { race: 'White', sex: 'Female', count: 20, passed: 12 },
  { race: 'Asian', sex: 'Male', count: 18, passed: 16 },
  { race: 'Asian', sex: 'Female', count: 18, passed: 11 },
  { race: 'Black or African American', sex: 'Male', count: 17, passed: 10 },
  { race: 'Black or African American', sex: 'Female', count: 17, passed: 7 },
  { race: 'Hispanic or Latino', sex: 'Male', count: 16, passed: 13 },
  { race: 'Hispanic or Latino', sex: 'Female', count: 16, passed: 9 },
];

export async function seedBiasDemo(): Promise<void> {
  // Idempotent guard — skip if the demo candidates are already present.
  const existing =
    (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(candidates)
      .where(sql`${candidates.email} LIKE ${DEMO_EMAIL_PREFIX + '%'}`))[0]?.n ?? 0;
  if (existing > 0) return;

  // Dedicated demo role so the fairness sample never mixes with real roles.
  const [req] = await db
    .insert(jobRequisitions)
    .values({ department: DEMO_REQ_DEPT, hiringManager: 'Demo Hiring Manager', status: 'Open' })
    .returning();
  const [jd] = await db
    .insert(jobDescriptions)
    .values({
      reqId: req.id,
      jobTitle: 'Demo Role — Fairness Sandbox',
      requiredQualifications: 'Demo role used to populate the fairness / adverse-impact audit with sample data.',
      status: 'Published',
    })
    .returning();

  let n = 0;
  for (const cell of CELLS) {
    for (let i = 0; i < cell.count; i++) {
      n++;
      const passed = i < cell.passed;
      const [cand] = await db
        .insert(candidates)
        .values({
          jdId: jd.id,
          firstName: 'Demo',
          lastName: `Candidate ${String(n).padStart(3, '0')}`,
          email: `${DEMO_EMAIL_PREFIX}${n}@example.com`,
          source: 'Demo seed',
          currentStage: passed ? 'Hired' : 'Rejected',
          ccatScore: passed ? 38 + (n % 8) : 20 + (n % 8),
          ccatPercentile: passed ? 70 + (n % 25) : 25 + (n % 25),
          eppValuesMatchScore: passed ? 78 + (n % 15) : 45 + (n % 20),
          resumeReviewScore: passed ? 80 + (n % 15) : 50 + (n % 20),
        })
        .returning();

      await logDecision(db, {
        candidateId: cand.id,
        decisionType: 'assessment_gate',
        outcome: passed ? 'passed' : 'failed',
        decidedByType: 'deterministic',
        reason: passed ? 'Demo seed: assessment above the gate.' : 'Demo seed: assessment below the gate.',
        score: passed ? 78 : 52,
      });

      await db.insert(eeoResponses).values({
        candidateId: cand.id,
        token: randomUUID(),
        status: 'completed',
        sex: cell.sex,
        raceEthnicity: cell.race,
        veteranStatus: 'Not a protected veteran',
        disabilityStatus: 'No',
        submittedAt: new Date(),
      });
    }
  }
  console.log(`[boot] bias demo seed: created ${n} demo candidates on role "${jd.jobTitle}".`);
}

// Allow `npm run db:seed:bias` (tsx server/src/seedBiasDemo.ts) as well as boot.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  seedBiasDemo()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
