// ============================================================
// INTERNAL REPORT CONFIG — read/write the leadership notification
// recipient list in app_settings. Recipients are auto-emailed on each
// internal express-interest (see internalOpenings.applyInternal).
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

const RECIPIENTS_KEY = 'internal_report_recipients';
const ENABLED_KEY = 'internal_report_enabled';

export async function getInternalReportConfig(db: any): Promise<{ recipients: string[]; enabled: boolean }> {
  const r = await db.query.appSettings.findFirst({ where: eq(appSettings.key, RECIPIENTS_KEY) });
  const e = await db.query.appSettings.findFirst({ where: eq(appSettings.key, ENABLED_KEY) });
  return {
    recipients: Array.isArray(r?.value) ? (r!.value as string[]) : [],
    enabled: e?.value === true,
  };
}

async function upsertSetting(db: any, key: string, value: any, userId?: string) {
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description: 'Internal candidates report config', updatedBy: userId ?? null });
  }
}

export async function setInternalReportConfig(db: any, cfg: { recipients: string[]; enabled: boolean }, userId?: string) {
  await upsertSetting(db, RECIPIENTS_KEY, cfg.recipients, userId);
  await upsertSetting(db, ENABLED_KEY, cfg.enabled, userId);
}

