// ============================================================
// VALUES HTTP API — read-only, keyed, cross-app surface
//
// Exposes the company-values framework (definitions + rubric) so other Type 2
// apps can mirror it read-only instead of hand-maintaining a second copy.
// ATA is the single source of truth for values; consumers (e.g. AI Engagement)
// pull this on a schedule / on demand and cache locally.
//
// Mount in server.ts:   app.use('/api/values', valuesApiRouter)
// Auth:                 x-api-key: <VALUES_API_KEY>
// Method:               GET /   -> { values: [...], generatedAt }
//
// READ-ONLY by design: no create/update/delete. Editing values stays in the
// ATA admin UI (Company Values). Added 2026-07-08 for the AIE values sync.
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { asc } from 'drizzle-orm';
import { db } from '../db.js';
import { companyValues } from '../db/schema/values.js';

export const valuesApiRouter = Router();

// ── x-api-key auth ───────────────────────────────────────────
valuesApiRouter.use((req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.VALUES_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'api-key-not-configured', message: 'VALUES_API_KEY is not set on this deployment.' });
  }
  const provided = req.header('x-api-key');
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid x-api-key.' });
  }
  next();
});

function asyncH(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ── GET /  — the full values framework ───────────────────────
// includeInactive=1 returns retired values too (default: active only).
valuesApiRouter.get('/', asyncH(async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const rows = await db.query.companyValues.findMany({
    orderBy: [asc(companyValues.pillar), asc(companyValues.sortOrder), asc(companyValues.name)],
  });
  const values = rows
    .filter((v) => includeInactive || v.active)
    .map((v) => ({
      externalId: v.id,                 // ATA's stable id — the consumer keys its cache on this
      name: v.name,
      pillar: v.pillar,
      category: v.category ?? null,
      description: v.description ?? null,
      rubric: {},                       // reserved: per-value scoring rubric (none defined yet)
      meta: { eppDimensions: v.eppDimensions ?? [] },
      sortOrder: v.sortOrder,
      active: v.active,
    }));
  res.json({ values, generatedAt: new Date().toISOString() });
}));
