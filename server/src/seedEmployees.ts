// Sample internal employees who can act as value reviewers.
import { db } from './db.js';
import { employees } from './db/schema/employees.js';
import { sql } from 'drizzle-orm';

const PEOPLE = [
  { name: 'Priya Nair', title: 'Engineering Manager', email: 'priya.nair@lightspeed.example.com' },
  { name: 'Marcus Bell', title: 'Sales Director', email: 'marcus.bell@lightspeed.example.com' },
  { name: 'Dana Liu', title: 'Customer Success Lead', email: 'dana.liu@lightspeed.example.com' },
  { name: 'Sofia Reyes', title: 'Head of Product', email: 'sofia.reyes@lightspeed.example.com' },
  { name: 'Jordan Kim', title: 'Senior Recruiter', email: 'jordan.kim@lightspeed.example.com' },
  { name: 'Alex Morgan', title: 'People Operations', email: 'alex.morgan@lightspeed.example.com' },
];

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
