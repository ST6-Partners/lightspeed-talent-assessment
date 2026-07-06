// ============================================================
// INTERNAL REPORT — compose the "internal candidates in flight"
// report and read/write its schedule config (recipients + enabled)
// in app_settings. Used by the manual send, the config UI, and the
// weekly cron job.
// ============================================================
import { eq } from 'drizzle-orm';
import { candidates, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
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

export async function composeInternalReport(db: any): Promise<{ subject: string; html: string; count: number }> {
  const rows = await db.query.candidates.findMany({ where: eq(candidates.isInternal, true) });
  const active = rows.filter((c: any) => c.currentStage !== 'Rejected' && c.currentStage !== 'Hired');
  const cell = 'padding:6px 10px;border:1px solid #ddd;';
  const lines: string[] = [];
  for (const c of active) {
    const jd = c.jdId ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, c.jdId) }) : null;
    const req = (jd as any)?.reqId ? await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, (jd as any).reqId) }) : null;
    lines.push(`<tr><td style="${cell}">${c.firstName} ${c.lastName}</td><td style="${cell}">${jd?.jobTitle ?? '-'}</td><td style="${cell}">${(req as any)?.department ?? '-'}</td><td style="${cell}">${c.currentStage}</td><td style="${cell}">${(c as any).managerAware ? 'yes' : 'no'}</td></tr>`);
  }
  const html = `<div style="font-family:sans-serif;font-size:14px;color:#1a1a1a;"><h2>Internal candidates in flight</h2>${active.length ? `<table style="border-collapse:collapse;"><tr><th style="${cell}text-align:left;">Name</th><th style="${cell}text-align:left;">Role</th><th style="${cell}text-align:left;">Department</th><th style="${cell}text-align:left;">Stage</th><th style="${cell}text-align:left;">Manager aware</th></tr>${lines.join('')}</table>` : '<p>No internal candidates currently in the pipeline.</p>'}<p style="color:#666;font-size:12px;">Sent so leadership stays aware of internal moves in progress.</p></div>`;
  return { subject: `Internal candidates in flight — ${active.length}`, html, count: active.length };
}
