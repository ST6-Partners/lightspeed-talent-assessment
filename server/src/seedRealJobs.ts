// ============================================================
// REAL JOB DESCRIPTIONS — one-time cleanup + seed
//
// Replaces the demo/sample hiring data with 20 real Lightspeed
// requisitions + job descriptions (all status 'Draft').
//
// Run (deploy):   npm run db:seed:realjobs
//
// Run order baked into run(): (1) cleanup delete, (2) seed insert,
// (3) verify counts — per ata-jd-implementation-brief.md.
//
// Idempotent: if the real roles are already present it skips entirely,
// so a second run will NOT delete freshly-seeded data.
//
// DESTRUCTIVE: cleanup() removes the demo sample roles. Do not run
// against a database holding real candidate-linked production data
// without reviewing the cleanup signatures below.
// ============================================================

import { db } from './db.js';
import { jobRequisitions, jobDescriptions } from './db/schema/hiring.js';
import { ataSeedRoles } from './data/ataSeedRoles.js';
import { inArray, eq, sql } from 'drizzle-orm';

// Sample demo JD titles seeded by seedHiring.ts (each inserted ~3x).
// None of these titles appears in the 20 real roles, so deleting by
// title is unambiguous.
const SAMPLE_JD_TITLES = [
  'Senior Software Engineer',
  'Account Executive',
  'Customer Success Manager',
  'Product Manager',
];

// The 2026-06-30 investigation demo: a single 'Software Engineer' Draft
// + its requisition. cleanup() runs BEFORE seed(), so at cleanup time the
// only 'Software Engineer' present is this demo record; the real one is
// re-created cleanly by the seed.
const DEMO_DRAFT_TITLE = 'Software Engineer';

// A distinctive real-role title used as the "already seeded" marker.
const SEED_MARKER_TITLE = 'VP, Security & Cloud Operations';

const lines = (arr: string[]) => arr.join('\n');

// ── 1. Cleanup ──────────────────────────────────────────────
export async function cleanupSampleData() {
  const titles = [...SAMPLE_JD_TITLES, DEMO_DRAFT_TITLE];

  // Find every JD with a sample/demo title, collect their requisitions.
  const jds = await db
    .select({ id: jobDescriptions.id, reqId: jobDescriptions.reqId, title: jobDescriptions.jobTitle })
    .from(jobDescriptions)
    .where(inArray(jobDescriptions.jobTitle, titles));

  const reqIds = Array.from(new Set(jds.map((j) => j.reqId).filter(Boolean) as string[]));

  // Deleting the requisition cascades to its job_descriptions
  // (job_descriptions.req_id ON DELETE CASCADE) and detaches any linked
  // candidates (candidates.jd_id ON DELETE SET NULL).
  if (reqIds.length > 0) {
    await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, reqIds));
  }

  console.log(`  [cleanup] removed ${reqIds.length} sample/demo requisitions and ${jds.length} job descriptions.`);
  return { deletedReqs: reqIds.length, deletedJds: jds.length };
}

// ── 2. Seed the 20 real roles ───────────────────────────────
export async function seedRealJobs() {
  let count = 0;
  for (const role of ataSeedRoles) {
    const r = role.requisition;
    const jd = role.jobDescription;

    const [req] = await db
      .insert(jobRequisitions)
      .values({
        department: r.department,
        hiringManager: r.hiringManager,
        numOpenings: r.openings,
        employmentType: r.employmentType,
        location: r.location,
        remote: r.remoteEligible,
        reason: r.reasonForHire ?? null,
        priority: r.priority,
        status: 'Draft',
      })
      .returning({ id: jobRequisitions.id });

    await db.insert(jobDescriptions).values({
      reqId: req.id,
      jobTitle: jd.title,
      summary: jd.summary,
      responsibilities: lines(jd.responsibilities),
      requiredQualifications: lines(jd.requiredQualifications),
      preferredQualifications: lines(jd.preferredQualifications),
      eppValues: jd.eppValues,
      workSampleInstructions: jd.workSampleInstructions ?? null,
      status: 'Draft',
    });

    count++;
  }
  console.log(`  [seed] inserted ${count} requisitions + ${count} job descriptions (status Draft).`);
  return count;
}

// ── 3. Verify ───────────────────────────────────────────────
export async function verifySeed() {
  const reqCount = (await db.select({ n: sql<number>`count(*)::int` }).from(jobRequisitions))[0]?.n ?? 0;
  const jdCount = (await db.select({ n: sql<number>`count(*)::int` }).from(jobDescriptions))[0]?.n ?? 0;

  // Each of the 20 seeded titles should appear exactly once.
  const dupes: string[] = [];
  for (const role of ataSeedRoles) {
    const n = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.jobTitle, role.jobDescription.title)))[0]?.n ?? 0;
    if (n !== 1) dupes.push(`${role.jobDescription.title} (${n})`);
  }

  console.log(`  [verify] ${reqCount} requisitions, ${jdCount} job descriptions in the DB.`);
  if (dupes.length) {
    console.warn(`  [verify] ⚠ titles not appearing exactly once: ${dupes.join('; ')}`);
  } else {
    console.log('  [verify] ✓ all 20 seeded titles appear exactly once.');
  }
  return { reqCount, jdCount, dupes };
}

// ── Runner: cleanup → seed → verify ─────────────────────────
export async function runRealJobs() {
  const marker = await db
    .select({ id: jobDescriptions.id })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.jobTitle, SEED_MARKER_TITLE));

  if (marker.length > 0) {
    console.log('  [realjobs] real roles already present — skipping cleanup + seed (idempotent).');
    await verifySeed();
    return;
  }

  console.log('  [realjobs] Step 1/3 — cleanup demo + sample data...');
  await cleanupSampleData();
  console.log('  [realjobs] Step 2/3 — seed 20 real roles...');
  await seedRealJobs();
  console.log('  [realjobs] Step 3/3 — verify...');
  await verifySeed();
}

// Standalone runner
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runRealJobs()
    .then(() => { console.log('Real job seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Real job seed failed:', err); process.exit(1); });
}
