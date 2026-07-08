// Real Lightspeed Systems roster — internal employees who can act as value reviewers.
import { db } from './db.js';
import { employees } from './db/schema/employees.js';
import { sql } from 'drizzle-orm';

// NOTE: The real Lightspeed roster was removed for testing (2026-07-08) to stop
// internal-announce from emailing real @lightspeedsystems.com addresses. Repopulate
// with safe test addresses (or reconnect HRIS) before enabling real internal announcements.
const PEOPLE: Array<{ name: string; email: string }> = [];

export async function seedEmployees() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(employees);
  if ((existing[0]?.n ?? 0) > 0 && !process.env.RESEED) {
    console.log(`  [employees] ${existing[0].n} already present — skipping.`);
    return;
  }
  if ((existing[0]?.n ?? 0) > 0 && process.env.RESEED) {
    console.log('  [employees] RESEED=1 — clearing employees...');
    await db.delete(employees);
  }
  for (const p of PEOPLE) await db.insert(employees).values(p);
  console.log(`  [employees] Seeded ${PEOPLE.length} employees.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) seedEmployees().then(() => { console.log('Employees seed complete.'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
