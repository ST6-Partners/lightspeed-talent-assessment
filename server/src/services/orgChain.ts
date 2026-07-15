// ============================================================
// ORG CHAIN — walk the reporting line upward.
// Given a starting manager's email, follow employees.managerEmail
// up the org chart (manager -> their manager -> ... -> ELT) and
// return the ordered list of emails ABOVE the start. App-managed
// data: works with whatever reporting lines are entered (test or
// real); HRIS later just auto-populates the same manager_email field.
// ============================================================
import { eq } from 'drizzle-orm';
import { employees } from '../db/schema/employees.js';

const MAX_DEPTH = 12; // safety cap against loops / very deep charts

// Returns the chain of manager emails above `startEmail`, excluding startEmail.
export async function walkLeadershipChain(db: any, startEmail: string | null | undefined): Promise<string[]> {
  if (!startEmail) return [];
  const chain: string[] = [];
  const seen = new Set<string>([startEmail.toLowerCase()]);
  let current = startEmail;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.email, current) });
    const next: string | null = emp?.managerEmail ?? null;
    if (!next || !next.includes('@')) break;
    const key = next.toLowerCase();
    if (seen.has(key)) break; // cycle guard
    seen.add(key);
    chain.push(next);
    current = next;
  }
  return chain;
}

// Resolve an employee's email from their display name (case-insensitive).
// Used to start the offer-approval chain from the ROLE's real hiring manager
// (requisitions store the manager as a name, not an email) rather than a global
// env address. Returns null if no matching employee with an email is found.
export async function emailForEmployeeName(db: any, name: string | null | undefined): Promise<string | null> {
  if (!name || !name.trim()) return null;
  const target = name.trim().toLowerCase();
  const all = await db.query.employees.findMany();
  const match = all.find((e: any) => (e.name ?? '').trim().toLowerCase() === target && e.email);
  return match?.email ?? null;
}
