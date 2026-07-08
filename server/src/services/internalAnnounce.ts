// ============================================================
// INTERNAL ANNOUNCE — email all active employees that a role is
// open internally. Called automatically when a role opens
// (intake.openRoleAndSendKickoff), replacing the old manual
// "Announce internally" megaphone button.
// ============================================================
import { eq } from 'drizzle-orm';
import { employees } from '../db/schema/employees.js';
import { inboundEmails } from '../db/schema/email.js';
import { sendEmail } from './email.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

// Emails every active employee that a role is open internally. Returns how many were sent.
export async function announceRoleInternally(
  db: any,
  jd: { id: string; jobTitle: string },
  dept: string,
): Promise<{ sent: number }> {
  const url = `${appBaseUrl()}/apply-internal/${jd.id}`;
  const emps = await db.query.employees.findMany({ where: eq(employees.active, true) });
  const recipients = emps.map((e: any) => e.email).filter((e: string) => e && e.includes('@'));

  const subject = `Internal opening: ${jd.jobTitle}${dept ? ` (${dept})` : ''}`;
  const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
    <h2>New internal opening</h2>
    <p>We're opening a new role: <strong>${jd.jobTitle}</strong>${dept ? ` in ${dept}` : ''}.</p>
    <p>This role is open to internal applicants first for the next <strong>3 days</strong> before it posts externally. If you're interested, please let us know, and give your manager a heads-up as well.</p>
    <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Express interest</a></p>
    <p style="font-size:12px;color:#666;">Or paste this link: ${url}</p>
    <p>Lightspeed Systems Talent</p>
  </div>`;

  let sent = 0;
  for (const to of recipients) {
    await sendEmail({ to, subject, html, templateId: 'internal_opening' }).catch(() => {});
    sent++;
  }
  // One summary copy into the test inbox (not one per employee).
  try {
    await db.insert(inboundEmails).values({
      fromEmail: process.env.EMAIL_FROM ?? 'careers@lightspeedsystems.com', fromName: 'Lightspeed Careers',
      toEmail: `all employees (${sent})`, subject, body: html, replyTag: 'internal_opening', source: 'simulated',
      raw: { kind: 'internal_opening', jdId: jd.id, recipients: sent, auto: true },
    });
  } catch (err) { console.error('[internal announce] inbox record failed', err); }

  return { sent };
}
