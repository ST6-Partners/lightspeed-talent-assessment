// ============================================================
// EPP SEED — generates sample Criteria EPP profiles (12 traits,
// percentile 0–100) for candidates already in the system.
// Deterministic per candidate; later-stage candidates skew higher.
//
// Run standalone:  npm run db:seed:epp
// Re-seed (wipe):  RESEED=1 npm run db:seed:epp
// Also invoked by the main seed (server/src/seed.ts).
// ============================================================

import { db } from './db.js';
import { candidateEppScores } from './db/schema/epp.js';
import { candidates } from './db/schema/hiring.js';
import { sql } from 'drizzle-orm';

const TRAITS = [
  'Achievement', 'Assertiveness', 'Competitiveness', 'Conscientiousness',
  'Cooperativeness', 'Extroversion', 'Managerial', 'Motivation',
  'Openness', 'Patience', 'Self-Confidence', 'Stress Tolerance',
];

// Stage → quality base (how strong the profile tends to be)
const STAGE_BASE: Record<string, number> = {
  Hired: 78, Offered: 76, Interviewed: 72, 'Interview Scheduled': 70,
  'Values Review': 68, 'Work Sample': 62, Assessment: 56, Applied: 52, Rejected: 46,
};

// Deterministic RNG seeded from a string (mulberry32 over a simple hash)
function rngFrom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (n: number) => Math.max(3, Math.min(98, Math.round(n)));

export async function seedEpp() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(candidateEppScores);
  const have = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;
  if (have && !reseed) {
    console.log(`  [epp] ${existing[0].n} EPP rows already present — skipping (RESEED=1 to wipe & reseed).`);
    return;
  }
  if (have && reseed) {
    console.log('  [epp] RESEED=1 — clearing candidate_epp_scores...');
    await db.delete(candidateEppScores);
  }

  const cands = await db.query.candidates.findMany();
  let rows = 0;
  for (const c of cands) {
    const rng = rngFrom(c.id);
    const base = STAGE_BASE[c.currentStage as string] ?? 55;
    for (const trait of TRAITS) {
      // each trait = base + wide per-trait jitter so profiles look individual
      const jitter = (rng() - 0.5) * 46;
      const percentile = clamp(base + jitter);
      await db.insert(candidateEppScores).values({
        candidateId: c.id, trait, percentile,
      }).onConflictDoUpdate({
        target: [candidateEppScores.candidateId, candidateEppScores.trait],
        set: { percentile, updatedAt: new Date() },
      });
      rows += 1;
    }
  }
  console.log(`  [epp] Seeded ${rows} EPP trait scores across ${cands.length} candidates.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedEpp()
    .then(() => { console.log('EPP seed complete.'); process.exit(0); })
    .catch((err) => { console.error('EPP seed failed:', err); process.exit(1); });
}
