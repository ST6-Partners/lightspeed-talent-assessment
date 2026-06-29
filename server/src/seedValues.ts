// ============================================================
// COMPANY VALUES SEED — the Lightspeed values framework,
// organized as 3 pillars × 11 operating values, each mapped
// to EPP/Big-Five dimensions for scoring alignment.
//
// Run standalone:  npm run db:seed:values
// Re-seed (wipe):  RESEED=1 npm run db:seed:values
// Also invoked by the main seed (server/src/seed.ts).
// Idempotent: skips if values already exist unless RESEED=1.
// ============================================================

import { db } from './db.js';
import { companyValues, candidateValueScores } from './db/schema/values.js';
import { sql } from 'drizzle-orm';

type Pillar = 'Mission-Driven' | 'Customer-Obsessed' | 'Results-Focused';

interface ValueDef {
  name: string;
  pillar: Pillar;
  category: string;
  description: string;
  eppDimensions: string[];
}

const VALUES: ValueDef[] = [
  // ── Mission-Driven ──
  { name: 'Grit', pillar: 'Mission-Driven', category: 'Individual practice',
    description: 'Pushes through challenges.',
    eppDimensions: ['Achievement', 'Stress Tolerance', 'Conscientiousness'] },
  { name: 'Learn all the things', pillar: 'Mission-Driven', category: 'Individual practice',
    description: 'General curiosity drives innovation.',
    eppDimensions: ['Openness', 'Motivation'] },
  { name: "It's okay not to be okay", pillar: 'Mission-Driven', category: 'Individual practice',
    description: "Takes care of mental health and supports each other's.",
    eppDimensions: ['Stress Tolerance', 'Patience', 'Cooperativeness'] },

  // ── Customer-Obsessed ──
  { name: 'Understand our customers', pillar: 'Customer-Obsessed', category: 'Approach to our work',
    description: 'Anchors decisions in customer needs.',
    eppDimensions: ['Cooperativeness', 'Patience', 'Extroversion'] },
  { name: 'Trust and collaboration', pillar: 'Customer-Obsessed', category: 'Team dynamics',
    description: 'Listens, helps each other, is respectful and patient.',
    eppDimensions: ['Cooperativeness', 'Extroversion', 'Patience'] },
  { name: 'No-blame culture', pillar: 'Customer-Obsessed', category: 'Team dynamics',
    description: 'Assumes good intent; seeks to understand.',
    eppDimensions: ['Patience', 'Cooperativeness', 'Stress Tolerance'] },
  { name: 'Stay engaged with each other', pillar: 'Customer-Obsessed', category: 'Team dynamics',
    description: "Isn't siloed; stays responsive and interactive.",
    eppDimensions: ['Extroversion', 'Assertiveness', 'Motivation'] },

  // ── Results-Focused ──
  { name: "Don't let great get in the way of good", pillar: 'Results-Focused', category: 'Approach to our work',
    description: 'Moves fast, builds the foundation, then iterates.',
    eppDimensions: ['Openness', 'Achievement', 'Self-Confidence'] },
  { name: 'Own your work', pillar: 'Results-Focused', category: 'Approach to our work',
    description: 'Keeps accountable before anyone else does.',
    eppDimensions: ['Conscientiousness', 'Achievement'] },
  { name: 'Always do the right thing', pillar: 'Results-Focused', category: 'Approach to our work',
    description: "Doesn't cut corners; does right based on what's known.",
    eppDimensions: ['Conscientiousness', 'Cooperativeness'] },
  { name: 'Use the right tools for the right job', pillar: 'Results-Focused', category: 'Team dynamics',
    description: 'Pragmatic, fit-for-purpose execution.',
    eppDimensions: ['Conscientiousness', 'Openness'] },
];

export async function seedValues() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(companyValues);
  const have = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;

  if (have && !reseed) {
    console.log(`  [values] ${existing[0].n} values already present — skipping (RESEED=1 to wipe & reseed).`);
    return;
  }
  if (have && reseed) {
    console.log('  [values] RESEED=1 — clearing company_values + candidate_value_scores...');
    await db.delete(candidateValueScores);
    await db.delete(companyValues);
  }

  let order = 0;
  for (const v of VALUES) {
    order += 1;
    await db.insert(companyValues).values({
      name: v.name, pillar: v.pillar, category: v.category,
      description: v.description, eppDimensions: v.eppDimensions,
      sortOrder: order, active: true,
    });
  }
  console.log(`  [values] Seeded ${VALUES.length} company values across 3 pillars.`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedValues()
    .then(() => { console.log('Values seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Values seed failed:', err); process.exit(1); });
}
