// ============================================================
// WORK-SAMPLE SCORING CONFIG
// Pass mark + auto-reject toggle, stored in app_settings so they
// can be tuned without a deploy. Auto-reject defaults OFF and the
// threshold defaults to 60 — turn it on deliberately once the
// rubrics are calibrated.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

const THRESHOLD_KEY = 'work_sample_pass_threshold';
const AUTO_REJECT_KEY = 'work_sample_auto_reject_enabled';

export interface WorkSampleScoringConfig {
  passThreshold: number;     // 0-100; score >= threshold is a pass
  autoRejectEnabled: boolean; // when true, failing candidates are auto-rejected
}

export async function getWorkSampleScoringConfig(db: any): Promise<WorkSampleScoringConfig> {
  const t = await db.query.appSettings.findFirst({ where: eq(appSettings.key, THRESHOLD_KEY) });
  const a = await db.query.appSettings.findFirst({ where: eq(appSettings.key, AUTO_REJECT_KEY) });
  const raw = Number(t?.value);
  const passThreshold = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 60;
  return { passThreshold, autoRejectEnabled: a?.value === true };
}

async function upsert(db: any, key: string, value: any, userId?: string) {
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, description: 'Work-sample scoring config', updatedBy: userId ?? null });
  }
}

export async function setWorkSampleScoringConfig(db: any, cfg: WorkSampleScoringConfig, userId?: string) {
  const threshold = Math.max(0, Math.min(100, Math.round(cfg.passThreshold)));
  await upsert(db, THRESHOLD_KEY, threshold, userId);
  await upsert(db, AUTO_REJECT_KEY, !!cfg.autoRejectEnabled, userId);
}
