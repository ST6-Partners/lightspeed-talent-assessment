// ============================================================
// POSTING WINDOW — internal-first then external (flowchart node POST).
//
// Durable anchor: job_requisitions.posted_at (stamped when the role goes
// Open) and .external_opened_at (stamped by the manual early-open or the
// auto-flip cron). No dependence on the clearable test inbox. For roles
// posted before posted_at existed, we fall back to the kickoff record's
// timestamp so their window still resolves.
// ============================================================

import { inArray } from 'drizzle-orm';
import { inboundEmails } from '../db/schema/email.js';
import { jobRequisitions } from '../db/schema/hiring.js';

export const INTERNAL_WINDOW_DAYS = 3;

function parseRaw(raw: any): any {
  if (raw == null) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

export interface PostingWindow {
  reqId: string;
  windowStart: string | null;
  externalOpensAt: string | null;
  phase: 'internal' | 'external' | 'unknown';
  daysLeft: number | null;
  externallyOpened: boolean;
}

export async function getPostingWindows(db: any, reqIds: string[]): Promise<Record<string, PostingWindow>> {
  const out: Record<string, PostingWindow> = {};
  if (!reqIds.length) return out;

  const reqs = await db.select().from(jobRequisitions).where(inArray(jobRequisitions.id, reqIds));
  const reqById = new Map<string, any>(reqs.map((r: any) => [r.id, r]));

  // Fallback anchor for roles posted before posted_at existed: kickoff record time.
  const inbox = await db.select().from(inboundEmails);
  const kickoffs = inbox.filter((r: any) => r.replyTag === 'kickoff');
  const now = Date.now();

  for (const reqId of reqIds) {
    const req = reqById.get(reqId);
    let start: Date | null = req?.postedAt ? new Date(req.postedAt) : null;
    if (!start) {
      const ks = kickoffs
        .filter((r: any) => (parseRaw(r.raw).reqId ?? null) === reqId)
        .sort((a: any, b: any) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
      start = ks[0]?.receivedAt ? new Date(ks[0].receivedAt) : null;
    }
    const opened = !!req?.externalOpenedAt;

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

// Write a hiring-team inbox notice that a role opened externally (visibility only;
// the authoritative state is job_requisitions.external_opened_at).
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
