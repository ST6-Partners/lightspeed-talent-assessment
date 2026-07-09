// ============================================================
// REFERENCE-CHECK CONFIG
// How many candidates per requisition may be in reference check
// at once. The manager meeting was explicit: references only run
// on the final 2-3 candidates, both to avoid inundating references
// and because it's a final sanity check, not a screen. Stored in
// app_settings so it can be tuned without a deploy. Defaults to 3.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

const FINALIST_CAP_KEY = 'reference_finalist_cap';
export const DEFAULT_REFERENCE_FINALIST_CAP = 3;

export async function getReferenceFinalistCap(db: any): Promise<number> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, FINALIST_CAP_KEY) });
  const raw = Number(row?.value);
  // Clamp to a sane range; fall back to the default when unset/invalid.
  return Number.isFinite(raw) && raw >= 1 ? Math.min(25, Math.round(raw)) : DEFAULT_REFERENCE_FINALIST_CAP;
}

export async function setReferenceFinalistCap(db: any, cap: number, userId?: string) {
  const value = Math.max(1, Math.min(25, Math.round(cap)));
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, FINALIST_CAP_KEY) });
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, FINALIST_CAP_KEY));
  } else {
    await db.insert(appSettings).values({ key: FINALIST_CAP_KEY, value, description: 'Max candidates per requisition allowed in reference check at once', updatedBy: userId ?? null });
  }
  return value;
}
