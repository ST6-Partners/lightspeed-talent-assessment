// ============================================================
// DEPARTMENTS SEED — the starting org-function set for a
// software company. General is NOT a department; it is the
// baseline scope on a task (departmentId NULL).
//
// Run standalone:  npm run db:seed:departments
// Re-seed (wipe):  RESEED=1 npm run db:seed:departments
// Idempotent: skips if departments already exist unless RESEED=1.
// ============================================================

import { db } from './db.js';
import { departments } from './db/schema/departments.js';
import { sql } from 'drizzle-orm';

interface DeptDef { name: string; description: string; }

export const DEPARTMENTS: DeptDef[] = [
  { name: 'Engineering', description: 'Software development and platform engineering.' },
  { name: 'Product', description: 'Product management and roadmap ownership.' },
  { name: 'Design', description: 'Product design, UX, and research.' },
  { name: 'Marketing', description: 'Demand generation, content, and brand.' },
  { name: 'Sales', description: 'New business and account expansion.' },
  { name: 'Customer Success', description: 'Onboarding, support, and retention.' },
  { name: 'People / HR', description: 'Recruiting, people ops, and culture.' },
  { name: 'Finance / G&A', description: 'Finance, accounting, and general administration.' },
];

export async function seedDepartments() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(departments);
  const have = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;

  if (have && !reseed) {
    console.log(`  [departments] ${existing[0].n} departments already present — skipping (RESEED=1 to wipe & reseed).`);
    return;
  }
  if (have && reseed) {
    console.log('  [departments] RESEED=1 — clearing departments...');
    await db.delete(departments);
  }

  let order = 0;
  for (const d of DEPARTMENTS) {
    order += 1;
    await db.insert(departments).values({
      name: d.name, description: d.description, sortOrder: order, active: true,
    });
  }
  console.log(`  [departments] Seeded ${DEPARTMENTS.length} departments.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedDepartments()
    .then(() => { console.log('Departments seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Departments seed failed:', err); process.exit(1); });
}
