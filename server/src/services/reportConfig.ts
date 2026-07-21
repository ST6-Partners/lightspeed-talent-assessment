// ============================================================
// METRICS REPORT CONFIG — recipient lists, on/off, and delivery
// schedule (day + time) for the scheduled weekly and quarterly
// hiring-metrics report emails. Stored in app_settings (key/value),
// mirroring internalReport.ts. No migration.
//
// Deliberately opt-in and off by default: the old weekly report was cut
// after it spammed everyone, so nothing sends until a recipient list is
// set AND the toggle is on.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

export type ReportCadence = 'weekly' | 'quarterly';

const KEY = (c: ReportCadence) => `metrics_report_${c}`; // value: { enabled, recipients, schedule }

// Weekly: dayOfWeek 0=Sun .. 6=Sat. Quarterly: dayOfMonth 1..28, always
// in the first month of each quarter (Jan/Apr/Jul/Oct). Both carry an
// hour (0..23) and minute (0..59), interpreted in the server's time zone.
export interface WeeklySchedule { dayOfWeek: number; hour: number; minute: number }
export interface QuarterlySchedule { dayOfMonth: number; hour: number; minute: number }
export type ReportSchedule = WeeklySchedule | QuarterlySchedule;

export interface ReportConfig { enabled: boolean; recipients: string[]; schedule: ReportSchedule }

const DEFAULT_SCHEDULE: Record<ReportCadence, ReportSchedule> = {
  weekly:    { dayOfWeek: 1, hour: 8, minute: 0 },   // Monday 08:00
  quarterly: { dayOfMonth: 1, hour: 8, minute: 0 },  // 1st of the quarter month, 08:00
};

function clampInt(n: any, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function normalizeSchedule(cadence: ReportCadence, s: any): ReportSchedule {
  if (cadence === 'weekly') {
    const d = DEFAULT_SCHEDULE.weekly as WeeklySchedule;
    return {
      dayOfWeek: clampInt(s?.dayOfWeek, 0, 6, d.dayOfWeek),
      hour:      clampInt(s?.hour, 0, 23, d.hour),
      minute:    clampInt(s?.minute, 0, 59, d.minute),
    };
  }
  const d = DEFAULT_SCHEDULE.quarterly as QuarterlySchedule;
  return {
    dayOfMonth: clampInt(s?.dayOfMonth, 1, 28, d.dayOfMonth),
    hour:       clampInt(s?.hour, 0, 23, d.hour),
    minute:     clampInt(s?.minute, 0, 59, d.minute),
  };
}

// Build a node-cron expression from a schedule.
export function cronForReport(cadence: ReportCadence, schedule: ReportSchedule): string {
  if (cadence === 'weekly') {
    const s = schedule as WeeklySchedule;
    return `${s.minute} ${s.hour} * * ${s.dayOfWeek}`;
  }
  const s = schedule as QuarterlySchedule;
  return `${s.minute} ${s.hour} ${s.dayOfMonth} 1,4,7,10 *`;
}

export async function getReportConfig(db: any, cadence: ReportCadence): Promise<ReportConfig> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY(cadence)) });
  const v = (row?.value ?? {}) as any;
  return {
    enabled: v?.enabled === true,
    recipients: Array.isArray(v?.recipients) ? (v.recipients as string[]) : [],
    schedule: normalizeSchedule(cadence, v?.schedule),
  };
}

export async function setReportConfig(
  db: any,
  cadence: ReportCadence,
  cfg: { enabled: boolean; recipients: string[]; schedule?: any },
  userId?: string,
) {
  const key = KEY(cadence);
  const value = {
    enabled: !!cfg.enabled,
    recipients: (cfg.recipients ?? []).filter((e) => e && e.includes('@')),
    schedule: normalizeSchedule(cadence, cfg.schedule),
  };
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description: `Scheduled ${cadence} hiring-metrics report config`, updatedBy: userId ?? null });
  }
}
