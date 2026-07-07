// ============================================================
// POSTING WINDOW — internal-first then external (flowchart node POST).
//
// A role posts internally when its intake is fully approved (the kickoff
// record is written at that moment and never changes, so its timestamp is
// the stable window start — no schema change needed). The role opens
// EXTERNALLY when the 3-day window elapses, or when HR opens it early.
// Either way a "posting_external_open" marker record is written so the
// flip is a real, timestamped, deduplicated event, and the daily cron and
// the UI read the same server-authoritative phase.
// ============================================================

import { inboundEmails } from '../db/schema/email.js';

// Normalize a jsonb `raw` value that may arrive as an object or a JSON string.
function parseRaw(raw: any): any {
  if (raw == null) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export const INTERNAL_WINDOW_DAYS = 3;

export interface PostingWindow {
  reqId: string;
  windowStart: string | null;      // ISO — when it posted internally
  externalOpensAt: string | null;  // ISO — when the internal window closes
  phase: 'internal' | 'external' | 'unknown';
  daysLeft: number | null;
  externallyOpened: boolean;       // marker written (auto-flip or manual early open)
}

// Build posting windows for the given reqIds from the kickoff + external-open
// marker records (both live in inbound_emails as event records).
export async function getPostingWindows(db: any, reqIds: string[]): Promise<Record<string, PostingWindow>> {
  const out: Record<string, PostingWindow> = {};
  if (!reqIds.length) return out;
  const rows = await db.select().from(inboundEmails);
  const kickoffs = rows.filter((r: any) => r.replyTag === 'kickoff');
  const opens = rows.filter((r: any) => r.replyTag === 'posting_external_open');
  const now = Date.now();

  for (const reqId of reqIds) {
    const ks = kickoffs
      .filter((r: any) => (parseRaw(r.raw).reqId ?? null) === reqId)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const start = ks[0]?.createdAt ? new Date(ks[0].createdAt) : null;
    const opened = opens.some((r: any) => (parseRaw(r.raw).reqId ?? null) === reqId);

    if (!start) {
      out[reqId] = { reqId, windowStart: null, externalOpensAt: null, phase: 'unknown', daysLeft: null, externallyOpened: opened };
      continue;
    }
    const ext = new Date(start.getTime() + INTERNAL_WINDOW_DAYS * 86_400_000);
    const isExternal = opened || now >= ext.getTime();
    const daysLeft = isExternal ? 0 : Math.max(1, Math.ceil((ext.getTime() - now) / 86_400_000));
    out[reqId] = {
      reqId,
      windowStart: start.toISOString(),
      externalOpensAt: ext.toISOString(),
      phase: isExternal ? 'external' : 'internal',
      daysLeft,
      externallyOpened: opened,
    };
  }
  return out;
}

// Has the external-open marker already been written for this req?
export async function isExternallyOpened(db: any, reqId: string): Promise<boolean> {
  const rows = await db.select().from(inboundEmails);
  return rows.some((r: any) => r.replyTag === 'posting_external_open' && (parseRaw(r.raw).reqId ?? null) === reqId);
}

// Write the external-open marker (idempotent-ish: callers check first).
export async function writeExternalOpenMarker(db: any, reqId: string, jobTitle: string, department: string, mode: 'auto' | 'manual'): Promise<void> {
  await db.insert(inboundEmails).values({
    fromEmail: process.env.EMAIL_FROM ?? 'careers@lightspeedsystems.com',
    fromName: 'Lightspeed Careers',
    toEmail: process.env.HIRING_TEAM_INBOX ?? 'hiring-team@lightspeed.test',
    subject: `Now open externally: ${jobTitle}${department ? ` (${department})` : ''}`,
    body: `The internal-first window for ${jobTitle}${department ? ` (${department})` : ''} has ${mode === 'auto' ? 'closed' : 'been opened early by HR'}. The role is now open to external candidates — proceed with external sourcing/posting.`,
    replyTag: 'posting_external_open',
    source: 'simulated',
    raw: { kind: 'posting_external_open', reqId, mode },
  });
}
