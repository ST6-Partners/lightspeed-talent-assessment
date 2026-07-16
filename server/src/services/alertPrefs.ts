// ============================================================
// EMAIL ALERT PREFERENCES — global on/off switches for the automated
// notification/alert emails (the HR-facing ones people asked to mute).
// Stored in app_settings under one key. Default = enabled; an alert only
// stops sending when explicitly turned off. Read at send time in email.ts.
// ============================================================
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema/core.js';

const KEY = 'email_alert_prefs'; // value: { [templateId]: boolean }

// The alert emails a user can turn off. Candidate-facing lifecycle emails
// (application received, offer, rejection, etc.) are intentionally NOT here.
export const ALERT_TEMPLATES: { id: string; label: string; group: string }[] = [
  { id: 'new_application_hr',        label: 'New application received',        group: 'Applications' },
  { id: 'assessment_passed_hr',      label: 'Candidate passed the assessment', group: 'Assessment' },
  { id: 'assessment_failed_hr',      label: 'Candidate below assessment threshold', group: 'Assessment' },
  { id: 'work_sample_submitted_hr',  label: 'Work sample submitted',           group: 'Work sample' },
  { id: 'interview_scheduled_hr',    label: 'Interview scheduled',             group: 'Interviews' },
  { id: 'interview_completed_hr',    label: 'Interview completed',             group: 'Interviews' },
  { id: 'scorecard_reminder',        label: 'Scorecard reminder (hourly until filled)', group: 'Interviews' },
  { id: 'phone_screen_hr',           label: 'Phone screen scheduled',          group: 'Interviews' },
  { id: 'interview_booking_stalled_hr', label: 'Interview booking stalled',    group: 'Interviews' },
  { id: 'offer_accepted_hr',         label: 'Offer accepted',                  group: 'Offers' },
  { id: 'candidate_hired_hr',        label: 'Candidate hired',                 group: 'Offers' },
  { id: 'intake_approval_reminder',  label: 'Intake approval reminder',        group: 'Approvals' },
  { id: 'timeline_alerts',           label: 'Hiring timeline alerts digest',   group: 'Digests' },
  { id: 'internal_applicant_hr',     label: 'Internal applicant flagged',      group: 'Internal' },
  { id: 'internal_interest_alert',   label: 'Internal interest (leadership)',  group: 'Internal' },
];

const ALERT_IDS = new Set(ALERT_TEMPLATES.map((a) => a.id));
export function isAlertTemplate(id: string): boolean { return ALERT_IDS.has(id); }

export async function getAlertPrefs(db: any): Promise<Record<string, boolean>> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  const v = (row?.value ?? {}) as Record<string, boolean>;
  const out: Record<string, boolean> = {};
  for (const a of ALERT_TEMPLATES) out[a.id] = v[a.id] !== false; // default true
  return out;
}

// True unless explicitly turned off. Non-alert templates always return true.
export async function isAlertEnabled(db: any, templateId: string): Promise<boolean> {
  if (!ALERT_IDS.has(templateId)) return true;
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  const v = (row?.value ?? {}) as Record<string, boolean>;
  return v[templateId] !== false;
}

export async function setAlertPrefs(db: any, prefs: Record<string, boolean>, userId?: string) {
  const clean: Record<string, boolean> = {};
  for (const a of ALERT_TEMPLATES) if (a.id in prefs) clean[a.id] = !!prefs[a.id];
  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
  if (existing) {
    await db.update(appSettings).set({ value: clean, updatedAt: new Date(), updatedBy: userId ?? null }).where(eq(appSettings.key, KEY));
  } else {
    await db.insert(appSettings).values({ key: KEY, value: clean, description: 'Email alert on/off switches', updatedBy: userId ?? null });
  }
}
