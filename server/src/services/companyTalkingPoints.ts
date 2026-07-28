// ============================================================
// COMPANY TALKING POINTS
// Standard "who we are / values / department sizes" block that is
// attached to EVERY interview briefing so every interviewer represents
// the company the same way. The who-we-are blurb and the department
// sizes are editable (stored in app_settings, so no deploy needed);
// the values list is always pulled live from the Company Values table.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

const KEY = 'interview_talking_points';

// Editable part (stored). Values are NOT stored here — they come from the
// Company Values table so the briefing never drifts from the live list.
export interface TalkingPointsConfig {
  whoWeAre: string;
  departments: { name: string; size: string }[];
}

// Resolved talking points that go into a briefing.
export interface CompanyTalkingPoints {
  whoWeAre: string;
  values: { name: string; pillar: string; description: string | null }[];
  departments: { name: string; size: string }[];
}

const DEFAULT_WHO_WE_ARE =
  'Lightspeed Systems is a K-12 education technology company. Our products help schools keep students safe online and give teachers and administrators visibility into learning. We hire for our values first and coach for skills. Give every candidate the same short, honest picture of who we are and why the work matters. (Edit this in Company Values > Talking points.)';

export async function getTalkingPointsConfig(db: any): Promise<TalkingPointsConfig> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  const v = (row?.value ?? {}) as Partial<TalkingPointsConfig>;
  const whoWeAre = typeof v.whoWeAre === 'string' && v.whoWeAre.trim() ? v.whoWeAre : DEFAULT_WHO_WE_ARE;
  const depts = Array.isArray(v.departments)
    ? v.departments
        .filter((d: any) => d && typeof d.name === 'string' && d.name.trim())
        .map((d: any) => ({ name: String(d.name), size: String(d.size ?? '') }))
    : [];
  return { whoWeAre, departments: depts };
}

export async function setTalkingPointsConfig(db: any, cfg: TalkingPointsConfig, userId?: string) {
  const value = {
    whoWeAre: (cfg.whoWeAre ?? '').trim(),
    departments: (cfg.departments ?? [])
      .filter((d) => d && d.name && d.name.trim())
      .map((d) => ({ name: d.name.trim(), size: String(d.size ?? '').trim() })),
  };
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, KEY));
  } else {
    await db.insert(appSettings).values({ key: KEY, value, description: 'Standard company talking points shown in every interview briefing', updatedBy: userId ?? null });
  }
  return value;
}

// The full talking-points block for a briefing: editable who-we-are +
// department sizes, plus the live company-values list. If no departments have
// been configured yet, fall back to the department master list (size blank).
export async function getCompanyTalkingPoints(db: any): Promise<CompanyTalkingPoints> {
  const cfg = await getTalkingPointsConfig(db);
  // The briefing shows the three Lightspeed Way pillars with a short description
  // each (not the full operating-values list) so interviewers get a concise,
  // consistent read. Departments are intentionally omitted from the briefing.
  const values = [
    { name: 'Mission-Driven', pillar: '', description: 'We exist to keep students safe online and help schools succeed. We optimize for that mission, not just the task in front of us.' },
    { name: 'Customer-Obsessed', pillar: '', description: 'We anchor every decision on the real needs of educators, students, and administrators.' },
    { name: 'Results-Focused', pillar: '', description: 'We own outcomes and drive work to done with quality and accountability.' },
  ];
  return { whoWeAre: cfg.whoWeAre, values, departments: [] };
}
