// ============================================================
// FEEDBACK HTTP API — the keyed, cross-app surface (Contract v1.0 §4)
//
// This is the machine-readable rung the ONE shared `debug-agent` skill
// drives over HTTP with `x-api-key`. The Stage A tRPC routers are the
// in-app surface (admin cockpit, the app's own client); this Express
// router is what every conformant Type 2 app exposes so the skill needs
// NO per-app adapter. Base path: /api/feedback (Signal's standard).
//
// Mount in server.ts:   app.use('/api/feedback', feedbackApiRouter)
// Auth:                 x-api-key: <AGENT_API_KEY>  (per-app key)
// Tables:               feedback, agentRuns, feedbackAttachments,
//                       feedbackReviewAttempts, notifications, users
//
// T1 of the template-first build (06-04-26). Endpoints 1–9 of §4.
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { feedback, feedbackAttachments, agentRuns } from '../db/schema/feedback.js';
import { users } from '../db/schema/core.js';
import { notifications } from '../db/schema/notifications.js';
import { runFeedbackReview, promoteResolutionToFaq } from '../services/feedbackReviewService.js';

// Operational caps (Contract §7.3). Layer-4 config can override per app.
const MAX_ATTEMPTS_PER_ITEM = 3;

export const feedbackApiRouter = Router();

// ── x-api-key auth (Contract §4) ─────────────────────────────
// Every request requires the per-app key. This surface is intentionally
// decoupled from the app's session auth — the skill is not a logged-in user.
feedbackApiRouter.use((req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.AGENT_API_KEY; // per-app: <APP>_AGENT_API_KEY mapped here in Layer-4 config
  if (!expected) {
    return res.status(503).json({ error: 'api-key-not-configured', message: 'AGENT_API_KEY is not set on this deployment.' });
  }
  const provided = req.header('x-api-key');
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid x-api-key.' });
  }
  next();
});

// ── Shape a feedback row into the Contract §3.1 wire shape ───
function toWire(row: any, attachmentCount = 0, submitterName: string | null = null) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    description: row.description,                  // user's original — never overwritten
    claude_title: row.aiTitle ?? null,
    claude_description: row.aiDescription ?? null,
    screen: row.screenPath ?? null,
    priority: row.aiPriority ?? 'unset',
    severity: row.severity ?? 'unset',
    ai_review_result: row.aiReviewResult ?? null,
    chat_debug_session_id: row.chatDebugLogId ?? null,
    admin_notes: row.adminNotes ?? null,           // Contract §3.4 diagnosis JSON-string lives here
    resolved_by_type: row.resolvedByType ?? 'human',
    agent_run_id: row.agentRunId ?? null,
    agent_status: row.agentStatus ?? null,
    agent_pr_url: row.agentPrUrl ?? null,
    attachment_count: attachmentCount,
    created_at: row.createdAt,
    submitter_name: submitterName,
  };
}

function asyncH(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ── #1  GET /export?status=&type=&since= ─────────────────────
feedbackApiRouter.get('/export', asyncH(async (req, res) => {
  const { status, type, since } = req.query as Record<string, string | undefined>;
  const conds = [] as any[];
  if (status) conds.push(eq(feedback.status, status));
  if (type) conds.push(eq(feedback.type, type));
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) conds.push(gte(feedback.createdAt, d));
  }

  const rows = await db
    .select({ f: feedback, submitterName: users.name })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(500);

  // attachment counts in one grouped query
  const counts = await db
    .select({ feedbackId: feedbackAttachments.feedbackId, c: sql<number>`count(*)` })
    .from(feedbackAttachments)
    .groupBy(feedbackAttachments.feedbackId);
  const countMap = new Map(counts.map((r) => [r.feedbackId, Number(r.c)]));

  res.json({ items: rows.map((r) => toWire(r.f, countMap.get(r.f.id) ?? 0, r.submitterName ?? null)) });
}));

// ── #4  POST /agent-runs  (create run) ───────────────────────
feedbackApiRouter.post('/agent-runs', asyncH(async (req, res) => {
  const { id, status, model, triggeredBy } = req.body ?? {};
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'missing run id (slug)' });
  const [run] = await db.insert(agentRuns).values({
    id,
    status: status ?? 'running',
    model: model ?? null,
    triggeredBy: triggeredBy ?? 'debug-agent-skill',
    triggeredAt: new Date(),
  }).returning();
  res.json(run);
}));

// ── #5  PUT /agent-runs/:id  (update counts/status) ──────────
feedbackApiRouter.put('/agent-runs/:id', asyncH(async (req, res) => {
  const existing = await db.query.agentRuns.findFirst({ where: eq(agentRuns.id, String(req.params.id)) });
  if (!existing) return res.status(404).json({ error: 'run not found' });

  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  for (const k of ['itemsTotal', 'itemsFixed', 'itemsPmReview', 'itemsSkipped', 'itemsFailed', 'error', 'summary'] as const) {
    if (b[k] !== undefined) updates[k] = b[k];
  }
  if (b.runLog !== undefined) updates.runLog = b.runLog;
  if (b.status) {
    updates.status = b.status;
    if (['completed', 'failed', 'skipped'].includes(b.status)) updates.completedAt = new Date();
  }
  const [run] = await db.update(agentRuns).set(updates).where(eq(agentRuns.id, String(req.params.id))).returning();
  res.json(run);
}));

// ── #3  POST /ai-review  (pre-submit review; saves NO feedback) ──
feedbackApiRouter.post('/ai-review', asyncH(async (req, res) => {
  const { type, title, description, severity, priority, screenPath, context } = req.body ?? {};
  if (!type || !title) return res.status(400).json({ error: 'type and title are required' });

  // Attribute the deflection-telemetry attempt to a system user if one resolves;
  // otherwise return a compute-only result (no attempt row).
  let userId: string | null = (req.body?.userId as string) ?? null;
  if (!userId) {
    const sysEmail = process.env.SEED_SUPER_ADMIN_EMAIL;
    const sysUser = sysEmail
      ? await db.query.users.findFirst({ where: eq(users.email, sysEmail) })
      : await db.query.users.findFirst({});
    userId = sysUser?.id ?? null;
  }

  const result = await runFeedbackReview(db, {
    type, title, description, severity, priority, screenPath, contextSnapshot: context,
  }, { userId });

  res.json(result);
}));

// ── #6  PUT /agent-review/:id  (route-to-human; propose-and-approve) ──
// :id is the FEEDBACK id. Attaches diagnosis + optional PR, sets pm_review.
// NEVER resolves. Enforces the attempt cap (Contract §7.3).
feedbackApiRouter.put('/agent-review/:id', asyncH(async (req, res) => {
  const existing = await db.query.feedback.findFirst({ where: eq(feedback.id, String(req.params.id)) });
  if (!existing) return res.status(404).json({ error: 'feedback not found' });

  if ((existing.agentAttemptCount ?? 0) >= MAX_ATTEMPTS_PER_ITEM) {
    return res.status(429).json({ error: 'attempt-cap', message: `Attempt cap (${MAX_ATTEMPTS_PER_ITEM}) reached for ${String(req.params.id)}` });
  }

  const { admin_notes, agent_run_id, resolution_notes, pr_url } = req.body ?? {};
  if (!admin_notes || !agent_run_id) return res.status(400).json({ error: 'admin_notes (JSON string) and agent_run_id are required' });

  // admin_notes is a JSON string (Contract §3.4). Parse defensively to mirror
  // the native object into agent_diagnosis for querying; keep the string as-is.
  let diagnosisObj: any = null;
  try { diagnosisObj = typeof admin_notes === 'string' ? JSON.parse(admin_notes) : admin_notes; } catch { diagnosisObj = null; }
  const adminNotesStr = typeof admin_notes === 'string' ? admin_notes : JSON.stringify(admin_notes);

  const [updated] = await db.update(feedback).set({
    status: 'pm_review',
    agentStatus: pr_url ? 'auto_fixed' : 'pm_review',
    agentRunId: agent_run_id,
    agentDiagnosis: diagnosisObj as any,
    agentPrUrl: pr_url ?? null,
    adminNotes: adminNotesStr,
    agentAttemptCount: (existing.agentAttemptCount ?? 0) + 1,
    resolvedByType: 'agent',
    updatedAt: new Date(),
  }).where(eq(feedback.id, String(req.params.id))).returning();

  // Notify admins (Contract §6: agent_resolution).
  const admins = await db.query.users.findMany({ where: eq(users.role, 'admin') });
  if (admins.length) {
    const conf = diagnosisObj?.confidence?.total;
    await db.insert(notifications).values(
      admins.map((a) => ({
        userId: a.id,
        type: 'agent_resolution',
        message: `Agent proposed for "${existing.title}"${pr_url ? ' — PR ready to review' : ' — diagnosis only'}${conf ? `. Confidence ${conf}/12.` : '.'}`,
        referenceId: existing.id,
        referenceType: 'feedback',
      })),
    ).onConflictDoNothing();
  }

  res.json({ ...toWire(updated), resolution_notes: resolution_notes ?? null });
}));

// ── #7  PUT /:id/resolve  (terminal resolve) ─────────────────
feedbackApiRouter.put('/:id/resolve', asyncH(async (req, res) => {
  const existing = await db.query.feedback.findFirst({ where: eq(feedback.id, String(req.params.id)) });
  if (!existing) return res.status(404).json({ error: 'feedback not found' });

  const { resolution_notes, resolved_by_type, agent_run_id, admin_notes } = req.body ?? {};
  const adminNotesStr = admin_notes === undefined || admin_notes === null
    ? existing.adminNotes
    : (typeof admin_notes === 'string' ? admin_notes : JSON.stringify(admin_notes));

  const [updated] = await db.update(feedback).set({
    status: 'resolved',
    resolvedAt: new Date(),
    resolvedByType: resolved_by_type ?? 'agent',
    agentRunId: agent_run_id ?? existing.agentRunId,
    adminNotes: adminNotesStr,
    updatedAt: new Date(),
  }).where(eq(feedback.id, String(req.params.id))).returning();

  await promoteResolutionToFaq(db, existing, resolution_notes);

  // Notify the submitter (feedback_response) + admins (agent_resolution).
  const notes: any[] = [{
    userId: existing.userId,
    type: 'feedback_response',
    message: resolution_notes
      ? `Your feedback "${existing.title}" was resolved: ${String(resolution_notes).slice(0, 240)}`
      : `Your feedback "${existing.title}" was resolved.`,
    referenceId: existing.id,
    referenceType: 'feedback',
  }];
  const admins = await db.query.users.findMany({ where: eq(users.role, 'admin') });
  for (const a of admins) {
    notes.push({
      userId: a.id,
      type: 'agent_resolution',
      message: `Feedback "${existing.title}" resolved (${resolved_by_type ?? 'agent'}).`,
      referenceId: existing.id,
      referenceType: 'feedback',
    });
  }
  await db.insert(notifications).values(notes).onConflictDoNothing();

  res.json(toWire(updated));
}));

// ── #9  GET /:id/attachments ─────────────────────────────────
feedbackApiRouter.get('/:id/attachments', asyncH(async (req, res) => {
  const rows = await db
    .select()
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.feedbackId, String(req.params.id)))
    .orderBy(feedbackAttachments.sortOrder);
  res.json({ attachments: rows });
}));

// ── #8  PUT /:id  (acknowledge / update) ─────────────────────
feedbackApiRouter.put('/:id', asyncH(async (req, res) => {
  const existing = await db.query.feedback.findFirst({ where: eq(feedback.id, String(req.params.id)) });
  if (!existing) return res.status(404).json({ error: 'feedback not found' });

  const { status, admin_notes } = req.body ?? {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (admin_notes !== undefined) {
    updates.adminNotes = typeof admin_notes === 'string' ? admin_notes : JSON.stringify(admin_notes);
  }
  const [updated] = await db.update(feedback).set(updates).where(eq(feedback.id, String(req.params.id))).returning();
  res.json(toWire(updated));
}));

// ── #2  GET /:id  (one item) — defined LAST so it doesn't shadow
//        /export, /agent-runs, /ai-review above. ───────────────
feedbackApiRouter.get('/:id', asyncH(async (req, res) => {
  const row = await db.query.feedback.findFirst({ where: eq(feedback.id, String(req.params.id)) });
  if (!row) return res.status(404).json({ error: 'feedback not found' });
  const submitter = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
  const cnt = await db
    .select({ c: sql<number>`count(*)` })
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.feedbackId, row.id));
  res.json(toWire(row, Number(cnt[0]?.c ?? 0), submitter?.name ?? null));
}));
