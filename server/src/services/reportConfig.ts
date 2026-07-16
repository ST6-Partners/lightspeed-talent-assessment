// ============================================================
// METRICS REPORT CONFIG — recipient lists + on/off for the scheduled
// weekly and quarterly hiring-metrics report emails. Stored in
// app_settings (key/value), mirroring internalReport.ts. No migration.
//
// Deliberately opt-in and off by default: the old weekly report was cut
// after it spammed everyone, so nothing sends until a recipient list is
// set AND the toggle is on.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

export type ReportCadence = 'weekly' | 'quarterly';

const KEY = (c: ReportCadence) => `metrics_report_${c}`; // value: { enabled: boolean, recipients: string[] }

export interface ReportConfig { enabled: boolean; recipients: string[] }

export async function getReportConfig(db: any, cadence: ReportCadence): Promise<ReportConfig> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY(cadence)) });
  const v = (row?.value ?? {}) as any;
  return {
    enabled: v?.enabled === true,
    recipients: Array.isArray(v?.recipients) ? (v.recipients as string[]) : [],
  };
}

export async function setReportConfig(db: any, cadence: ReportCadence, cfg: ReportConfig, userId?: string) {
  const key = KEY(cadence);
  const value = { enabled: !!cfg.enabled, recipients: (cfg.recipients ?? []).filter((e) => e && e.includes('@')) };
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description: `Scheduled ${cadence} hiring-metrics report config`, updatedBy: userId ?? null });
  }
}
