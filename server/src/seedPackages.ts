// ============================================================
// ASSESSMENT PACKAGES SEED
// One assignment per department: the General baseline task paired
// with that department's functional task. Runs after seedTasks.
//
// Run standalone:  npm run db:seed:packages
// Re-seed (wipe):  RESEED=1 npm run db:seed:packages
// Idempotent: skips if packages already exist unless RESEED=1.
// ============================================================

import { db } from './db.js';
import { assessmentPackages } from './db/schema/assessmentPackages.js';
import { assessmentTasks } from './db/schema/assessmentTasks.js';
import { departments } from './db/schema/departments.js';
import { isNull, sql } from 'drizzle-orm';

export async function seedPackages() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(assessmentPackages);
  const have = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;

  if (have && !reseed) {
    console.log(`  [packages] ${existing[0].n} packages already present — skipping (RESEED=1 to wipe & reseed).`);
    return;
  }
  if (have && reseed) {
    console.log('  [packages] RESEED=1 — clearing assessment_packages...');
    await db.delete(assessmentPackages);
  }

  // The General baseline task (departmentId NULL).
  const general = await db.select().from(assessmentTasks).where(isNull(assessmentTasks.departmentId)).limit(1);
  const generalTaskId = general[0]?.id ?? null;
  if (!generalTaskId) {
    console.warn('  [packages] WARNING: no General task found — run seedTasks first. Skipping.');
    return;
  }

  const depts = await db.select().from(departments);
  const tasks = await db.select().from(assessmentTasks);

  let count = 0;
  for (const d of depts) {
    const functional = tasks.find((t) => t.departmentId === d.id);
    if (!functional) {
      console.warn(`  [packages] No functional task for "${d.name}" — skipping its package.`);
      continue;
    }
    // A package goes Live only if its functional task is Live; else Draft.
    const status = functional.status === 'Live' ? 'Live' : 'Draft';
    await db.insert(assessmentPackages).values({
      name: `${d.name} assessment`,
      departmentId: d.id,
      generalTaskId,
      functionalTaskId: functional.id,
      status,
      version: 1,
      active: true,
    });
    count += 1;
  }
  console.log(`  [packages] Seeded ${count} assignment packages (General + functional per department).`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedPackages()
    .then(() => { console.log('Packages seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Packages seed failed:', err); process.exit(1); });
}
