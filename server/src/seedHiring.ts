// ============================================================
// HIRING SAMPLE-DATA SEED — realistic demo data for the
// AI Talent Assessment hiring pipeline.
//
// Run standalone:   npm run db:seed:hiring
// Re-seed (wipe first):  RESEED=1 npm run db:seed:hiring
// Also invoked by the main seed (server/src/seed.ts).
//
// Idempotent: if candidates already exist it skips, unless RESEED=1,
// which clears the 5 hiring tables (child -> parent) and re-inserts.
//
// NOTE: this is DEMO data. Do not run RESEED against a database that
// holds real candidate records.
// ============================================================

import { db } from './db.js';
import {
  jobRequisitions,
  jobDescriptions,
  candidates,
  candidateStageHistory,
  emailLog,
} from './db/schema/hiring.js';
import { sql } from 'drizzle-orm';

// ── Deterministic RNG (mulberry32) so re-seeds are reproducible ──
let _s = 0x9e3779b9;
function rng() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (lo: number, hi: number) => Math.floor(rng() * (hi - lo + 1)) + lo;
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

// ── Funnel stage order ──────────────────────────────────────
const STAGE_ORDER = [
  'Applied', 'Assessment', 'Work Sample', 'Values Review',
  'Interview Scheduled', 'Interviewed', 'Offered', 'Hired',
] as const;
type Stage = typeof STAGE_ORDER[number];

const SOURCES = ['LinkedIn', 'Referral', 'Company Site', 'Indeed', 'Recruiter Outreach', 'Greenhouse'];
const EPP_DIMS = [
  'agreeableness', 'cooperativeness', 'conscientiousness', 'dependability',
  'sociability', 'openness', 'extraversion', 'achievement', 'order', 'emotional_stability',
];

const FIRST = ['Ava','Liam','Maya','Noah','Sofia','Ethan','Zoe','Lucas','Mia','Kai','Nina','Owen',
  'Leah','Jonah','Ruby','Eli','Tara','Marco','Iris','Dev','Hana','Theo','Layla','Sam','Priya',
  'Diego','Nora','Omar','Cora','Asha','Felix','Grace','Ravi','Elena','Jack','Yuki','Aria','Ben',
  'Lena','Cyrus','Mira','Paul','Sana','Tom','Vera','Wes','Xena','Yara','Zane','Dana','Marcus','Sofia'];
const LAST = ['Nair','Bell','Liu','Reyes','Patel','Okafor','Kim','Rossi','Haddad','Singh','Cohen',
  'Mwangi','Torres','Nguyen','Petrov','Diaz','Park','Abbas','Romano','Mehta','Cruz','Yamada','Khan',
  'Olsen','Costa','Ferraro','Bauer','Lindqvist','Mensah','Garcia','Walsh','Novak','Tanaka','Ibrahim',
  'Lopez','Schmidt','Andersson','Fischer','Volkov','Sato'];

interface ReqDef {
  department: string; hiringManager: string; title: string;
  location: string; remote: boolean; salaryMin: number; salaryMax: number;
  priority: string; values: string[];
  summary: string; responsibilities: string; required: string; preferred: string; workSample: string;
}

const REQS: ReqDef[] = [
  {
    department: 'Engineering', hiringManager: 'Priya Nair', title: 'Senior Software Engineer',
    location: 'San Francisco, CA', remote: true, salaryMin: 150000, salaryMax: 195000,
    priority: 'High', values: ['innovation', 'accountability', 'collaboration', 'drive'],
    summary: 'Build and scale the core platform that powers Lightspeed products.',
    responsibilities: 'Design services and APIs; ship customer-facing features; mentor engineers; own reliability.',
    required: '5+ yrs building production web apps; strong TypeScript/Node; SQL; system design.',
    preferred: 'React, Postgres, cloud infra, prior startup experience.',
    workSample: 'Build a small full-stack feature against a provided API spec (2-3 hrs). Submit a repo link.',
  },
  {
    department: 'Sales', hiringManager: 'Marcus Bell', title: 'Account Executive',
    location: 'New York, NY', remote: false, salaryMin: 80000, salaryMax: 120000,
    priority: 'Medium', values: ['drive', 'customer focus', 'resilience', 'integrity'],
    summary: 'Own a full-cycle sales motion for mid-market accounts.',
    responsibilities: 'Prospect, run discovery, demo, negotiate, and close. Hit quarterly quota.',
    required: '3+ yrs closing B2B SaaS; consistent quota attainment.',
    preferred: 'MEDDIC/Challenger training; vertical SaaS experience.',
    workSample: 'Record a 5-min mock discovery call from a provided scenario.',
  },
  {
    department: 'Customer Success', hiringManager: 'Dana Liu', title: 'Customer Success Manager',
    location: 'Austin, TX', remote: true, salaryMin: 90000, salaryMax: 115000,
    priority: 'Medium', values: ['customer focus', 'empathy', 'collaboration', 'ownership'],
    summary: 'Drive adoption, retention, and expansion across a book of business.',
    responsibilities: 'Onboard customers, run QBRs, manage renewals, surface product feedback.',
    required: '3+ yrs in CS/account management; strong written communication.',
    preferred: 'Experience with usage-based products and churn modeling.',
    workSample: 'Draft a 90-day onboarding plan for a sample account profile.',
  },
  {
    department: 'Product', hiringManager: 'Sofia Reyes', title: 'Product Manager',
    location: 'Remote (US)', remote: true, salaryMin: 130000, salaryMax: 165000,
    priority: 'High', values: ['innovation', 'impact', 'leadership', 'customer focus'],
    summary: 'Own a product area end-to-end, from discovery through launch and iteration.',
    responsibilities: 'Define strategy, write specs, partner with eng/design, measure outcomes.',
    required: '4+ yrs PM on B2B software; data-driven; strong communication.',
    preferred: 'Technical background; experience with AI-enabled products.',
    workSample: 'Write a one-page PRD for a feature given a problem statement.',
  },
];

// currentStage distribution (sums to 52)
const DISTRIBUTION: Array<{ stage: Stage | 'Rejected'; n: number; rejectedFrom?: Stage }> = [
  { stage: 'Applied', n: 9 },
  { stage: 'Assessment', n: 6 },
  { stage: 'Work Sample', n: 5 },
  { stage: 'Values Review', n: 4 },
  { stage: 'Interview Scheduled', n: 3 },
  { stage: 'Interviewed', n: 3 },
  { stage: 'Offered', n: 2 },
  { stage: 'Hired', n: 2 },
  // Rejected, varied by where they dropped:
  { stage: 'Rejected', n: 4, rejectedFrom: 'Applied' },
  { stage: 'Rejected', n: 6, rejectedFrom: 'Assessment' },
  { stage: 'Rejected', n: 4, rejectedFrom: 'Work Sample' },
  { stage: 'Rejected', n: 2, rejectedFrom: 'Values Review' },
  { stage: 'Rejected', n: 2, rejectedFrom: 'Interviewed' },
];

const REJECTION_REASON: Record<string, string> = {
  Applied: 'Resume did not meet minimum qualifications',
  Assessment: 'CCAT score below threshold',
  'Work Sample': 'Work sample did not meet the bar',
  'Values Review': 'Values match below threshold',
  Interviewed: 'Not the right fit after interview',
};

function eppProfile(quality: 'low' | 'mid' | 'high') {
  const base = quality === 'high' ? [65, 90] : quality === 'mid' ? [50, 75] : [30, 58];
  const p: Record<string, number> = {};
  for (const d of EPP_DIMS) p[d] = rint(base[0], base[1]);
  return p;
}

export async function seedHiring() {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(candidates);
  const haveData = (existing[0]?.n ?? 0) > 0;
  const reseed = !!process.env.RESEED;

  if (haveData && !reseed) {
    console.log(`  [hiring] ${existing[0].n} candidates already present — skipping (set RESEED=1 to wipe & reseed).`);
    return;
  }
  if (haveData && reseed) {
    console.log('  [hiring] RESEED=1 — clearing hiring tables...');
    await db.delete(emailLog);
    await db.delete(candidateStageHistory);
    await db.delete(candidates);
    await db.delete(jobDescriptions);
    await db.delete(jobRequisitions);
  }

  // ── Requisitions + Job Descriptions ──────────────────────
  const jdIds: string[] = [];
  const jdMeta: Array<{ values: string[] }> = [];
  for (const r of REQS) {
    const [req] = await db.insert(jobRequisitions).values({
      department: r.department, hiringManager: r.hiringManager, numOpenings: rint(1, 3),
      employmentType: 'Full-Time', location: r.location, remote: r.remote,
      targetStartDate: daysAgo(-rint(20, 60)), salaryMin: r.salaryMin, salaryMax: r.salaryMax,
      reason: 'Backfill / growth', priority: r.priority, status: 'Open',
      createdAt: daysAgo(rint(60, 80)), updatedAt: daysAgo(rint(1, 30)),
    }).returning({ id: jobRequisitions.id });

    const [jd] = await db.insert(jobDescriptions).values({
      reqId: req.id, jobTitle: r.title, summary: r.summary,
      responsibilities: r.responsibilities, requiredQualifications: r.required,
      preferredQualifications: r.preferred, ccatThreshold: 30, eppValues: r.values,
      workSampleInstructions: r.workSample, status: 'Published',
      publishedAt: daysAgo(rint(55, 70)),
      createdAt: daysAgo(rint(60, 75)), updatedAt: daysAgo(rint(1, 30)),
    }).returning({ id: jobDescriptions.id });

    jdIds.push(jd.id);
    jdMeta.push({ values: r.values });
  }

  // ── Candidates + stage history + a few emails ────────────
  let made = 0;
  for (const bucket of DISTRIBUTION) {
    for (let i = 0; i < bucket.n; i++) {
      const jdIdx = made % jdIds.length;
      const jdId = jdIds[jdIdx];

      const first = pick(FIRST);
      const last = pick(LAST);
      const appliedDaysAgo = rint(3, 68);

      const isRejected = bucket.stage === 'Rejected';
      const finalStage: Stage = isRejected ? (bucket.rejectedFrom as Stage) : (bucket.stage as Stage);
      const reachedIdx = STAGE_ORDER.indexOf(finalStage);
      const passed = !isRejected; // reached finalStage cleanly when not rejected

      const reached = (s: Stage) => reachedIdx >= STAGE_ORDER.indexOf(s);

      // Scores depend on how far they got and whether they passed each gate
      let ccatScore: number | null = null;
      let eppValuesMatchScore: number | null = null;
      let eppProf: Record<string, number> | null = null;
      let workSampleScore: number | null = null;
      let resumeReviewScore: number | null = null;
      let interviewScore: number | null = null;

      // Resume review present for almost everyone (the top-of-funnel screen)
      resumeReviewScore = rint(40, 95);
      if (isRejected && bucket.rejectedFrom === 'Applied') resumeReviewScore = rint(25, 48);

      if (reached('Assessment')) {
        if (isRejected && bucket.rejectedFrom === 'Assessment') ccatScore = rint(15, 29);
        else ccatScore = rint(32, 56);
      }
      if (reached('Work Sample')) {
        if (isRejected && bucket.rejectedFrom === 'Work Sample') workSampleScore = rint(30, 55);
        else workSampleScore = rint(64, 95);
      }
      if (reached('Values Review')) {
        const drop = isRejected && bucket.rejectedFrom === 'Values Review';
        eppProf = eppProfile(drop ? 'low' : passed ? 'high' : 'mid');
        eppValuesMatchScore = drop ? rint(45, 68) : rint(72, 95);
      }
      if (reached('Interviewed')) {
        if (isRejected && bucket.rejectedFrom === 'Interviewed') interviewScore = rint(40, 62);
        else interviewScore = rint(72, 93);
      }

      const currentStage = isRejected ? 'Rejected' : finalStage;
      const interviewing = reached('Interview Scheduled');

      const [cand] = await db.insert(candidates).values({
        jdId,
        firstName: first, lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${rint(1, 99)}@example.com`,
        phone: `+1-555-${rint(100, 999)}-${rint(1000, 9999)}`,
        linkedinUrl: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
        source: pick(SOURCES),
        currentStage,
        rejectionReason: isRejected ? REJECTION_REASON[bucket.rejectedFrom as string] : null,
        ccatScore,
        eppProfile: eppProf,
        eppValuesMatchScore,
        workSampleScore,
        resumeReviewScore,
        interviewScore,
        assessmentSentAt: reached('Assessment') ? daysAgo(appliedDaysAgo - 2) : null,
        assessmentCompletedAt: reached('Work Sample') || (reached('Assessment') && !isRejected) ? daysAgo(appliedDaysAgo - 4) : null,
        interviewerName: interviewing ? pick(['Priya Nair', 'Marcus Bell', 'Dana Liu', 'Sofia Reyes']) : null,
        interviewerEmail: interviewing ? 'interviewer@lightspeed.example.com' : null,
        zoomMeetingId: interviewing ? `${rint(10000000000, 99999999999)}` : null,
        interviewFeedbackHr: interviewScore ? 'Structured scorecard completed; strengths and gaps noted.' : null,
        notes: rng() < 0.3 ? 'Strong referral; move quickly.' : null,
        createdAt: daysAgo(appliedDaysAgo),
        updatedAt: daysAgo(Math.max(1, appliedDaysAgo - reachedIdx * 2)),
      }).returning({ id: candidates.id });

      // Stage history chain: null -> Applied -> ... -> finalStage [-> Rejected]
      const chain: Array<{ from: Stage | null; to: Stage | 'Rejected' }> = [];
      chain.push({ from: null, to: 'Applied' });
      for (let s = 1; s <= reachedIdx; s++) {
        chain.push({ from: STAGE_ORDER[s - 1], to: STAGE_ORDER[s] });
      }
      if (isRejected) chain.push({ from: finalStage, to: 'Rejected' });

      let cursor = appliedDaysAgo;
      for (const step of chain) {
        await db.insert(candidateStageHistory).values({
          candidateId: cand.id,
          fromStage: step.from as any,
          toStage: step.to as any,
          reason: step.to === 'Rejected' ? REJECTION_REASON[bucket.rejectedFrom as string] : null,
          createdAt: daysAgo(cursor),
        });
        cursor = Math.max(1, cursor - rint(2, 6));
      }

      // A couple of email-log rows for those who got the assessment invite
      if (reached('Assessment')) {
        await db.insert(emailLog).values({
          candidateId: cand.id,
          recipient: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
          template: 'assessment_invitation',
          subject: `Next step in your application — ${REQS[jdIdx].title}`,
          status: 'sent',
          sentAt: daysAgo(appliedDaysAgo - 2),
          createdAt: daysAgo(appliedDaysAgo - 2),
        });
      }

      made++;
    }
  }

  console.log(`  [hiring] Seeded ${REQS.length} requisitions, ${jdIds.length} job descriptions, ${made} candidates with stage history.`);
}

// Standalone runner
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedHiring()
    .then(() => { console.log('Hiring seed complete.'); process.exit(0); })
    .catch((err) => { console.error('Hiring seed failed:', err); process.exit(1); });
}
