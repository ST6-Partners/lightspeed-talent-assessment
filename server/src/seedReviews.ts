// Sample multi-reviewer value reviews — demonstrates one candidate
// scored by several reviewers, each pre-seeded from EPP + jitter.
import { db } from './db.js';
import { companyValues, valueReviews, candidateValueScores } from './db/schema/values.js';
import { candidateEppScores } from './db/schema/epp.js';
import { employees } from './db/schema/employees.js';
import { candidates } from './db/schema/hiring.js';
import { sql, eq } from 'drizzle-orm';

const band = (p: number) => (p >= 85 ? 5 : p >= 70 ? 4 : p >= 55 ? 3 : p >= 30 ? 2 : 1);
const clamp = (n: number) => Math.max(1, Math.min(5, n));

export async function seedReviews() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(valueReviews);
  if ((existing[0]?.n ?? 0) > 0 && !process.env.RESEED) {
    console.log(`  [reviews] ${existing[0].n} reviews already present — skipping.`);
    return;
  }
  if ((existing[0]?.n ?? 0) > 0 && process.env.RESEED) {
    console.log('  [reviews] RESEED=1 — clearing value_reviews...');
    await db.delete(valueReviews); // cascades to candidate_value_scores
  }

  const vals = await db.query.companyValues.findMany();
  const emps = await db.query.employees.findMany();
  const cands = await db.query.candidates.findMany();
  if (!vals.length || emps.length < 2 || !cands.length) {
    console.log('  [reviews] missing values/employees/candidates — skipping.');
    return;
  }

  // Pick a couple of candidates that have EPP data (prefer named demo ones)
  const pick = cands.filter((c: any) => ['Patel', 'Cruz', 'Bell'].includes(c.lastName)).slice(0, 2);
  const chosen = pick.length ? pick : cands.slice(0, 2);

  let reviewCount = 0;
  for (const cand of chosen) {
    const eppRows = await db.select().from(candidateEppScores).where(eq(candidateEppScores.candidateId, cand.id));
    const byTrait: Record<string, number> = {};
    eppRows.forEach((r: any) => { byTrait[r.trait] = r.percentile; });

    // two reviewers per candidate, each with a small consistent bias
    const reviewers = emps.slice(0, 2);
    for (let i = 0; i < reviewers.length; i++) {
      const rev = reviewers[i];
      const bias = i === 0 ? 0 : -1; // second reviewer slightly tougher
      const [review] = await db.insert(valueReviews).values({
        candidateId: cand.id, reviewerId: rev.id,
        reviewedAt: new Date(Date.now() - (i + 1) * 2 * 86400_000),
      }).returning({ id: valueReviews.id });

      const rows = vals.map((v: any) => {
        const dims: string[] = Array.isArray(v.eppDimensions) ? v.eppDimensions : [];
        const got = dims.map((t) => byTrait[t]).filter((n) => typeof n === 'number') as number[];
        const avg = got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : 55;
        return { reviewId: review.id, valueId: v.id, score: clamp(band(avg) + bias) };
      });
      if (rows.length) await db.insert(candidateValueScores).values(rows);
      reviewCount += 1;
    }
  }
  console.log(`  [reviews] Seeded ${reviewCount} reviews across ${chosen.length} candidates.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) seedReviews().then(() => { console.log('Reviews seed complete.'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
