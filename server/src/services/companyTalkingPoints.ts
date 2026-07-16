// ============================================================
// COMPANY TALKING POINTS
// Standard "who we are / values / department sizes" block that is
// attached to EVERY interview briefing so every interviewer represents
// the company the same way. The who-we-are blurb and the department
// sizes are editable (stored in app_settings, so no deploy needed);
// the values list is always pulled live from the Company Values table.
// ============================================================
import { eq, asc } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';
import { companyValues } from '../db/schema/values.js';
import { departments } from '../db/schema/departments.js';

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
  const valueRows = await db.select().from(companyValues).orderBy(asc(companyValues.sortOrder));
  const values = valueRows
    .filter((v: any) => v.active !== false)
    .map((v: any) => ({ name: v.name, pillar: v.pillar, description: v.description ?? null }));
  let depts = cfg.departments;
  if (!depts.length) {
    const rows = await db.select().from(departments).orderBy(asc(departments.name));
    depts = rows.map((d: any) => ({ name: d.name as string, size: '' }));
  }
  return { whoWeAre: cfg.whoWeAre, values, departments: depts };
}
