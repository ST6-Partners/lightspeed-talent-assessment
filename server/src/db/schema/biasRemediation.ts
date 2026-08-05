// ============================================================
// BIAS-FLAG DISPOSITION (Remediate-this-flag, Bias tab)
//
// Workflow/audit-trail record for adverse-impact flags. One row per
// role (jd_id). An admin can acknowledge a flag or snooze it; the hourly
// bias-alert job reads this to decide whether to re-raise a flag.
//
// IMPORTANT: this table holds NO demographic data. It is deliberately
// NOT part of the EEO wall (services/adverseImpact.ts + routers/eeo.ts
// remain the only readers of eeo_responses). It records only the human
// decision about a flag, never the underlying self-ID data.
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';

// status:
//   'open'                             — flagged, nobody has acted (default)
//   'reviewed_no_change'               — looked at, judged acceptable/justified
//   'validated_documented'            — validation on file (job-related, documented)
//   'remediation_applied_monitoring'  — a change was made; watching it
//   'snoozed'                          — quiet until snooze_until
export const biasFlagDispositions = pgTable('bias_flag_dispositions', {
  id: uuid('id').primaryKey().defaultRandom(),
  jdId: uuid('jd_id').notNull().unique(),
  status: varchar('status', { length: 40 }).notNull().default('open'),
  note: text('note'),
  snoozeUntil: timestamp('snooze_until', { withTimezone: true }),
  decidedBy: uuid('decided_by'),
  decidedByName: varchar('decided_by_name', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Statuses that suppress a fresh bias alert (the operator has engaged with it).
// 'validated_documented' is kept here for backward-compat with any row already
// carrying it, even though it's no longer offered in the disposition dropdown.
export const ACK_STATUSES = [
  'reviewed_no_change',
  'validated_documented',
  'remediation_applied_monitoring',
] as const;

// Append-only history of bias alerts (the durable record behind the Bias tab's
// "Alert history" section). One row per alert firing; never deleted from the UI.
export const biasAlertLog = pgTable('bias_alert_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  jdId: uuid('jd_id'),
  jobTitle: varchar('job_title', { length: 300 }),
  summary: text('summary').notNull(),
  flaggedCount: integer('flagged_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
