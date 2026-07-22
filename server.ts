import crypto from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createHttpServer } from 'node:http';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { fileURLToPath } from 'url';
import { appRouter } from './server/src/router.js';
import { feedbackApiRouter } from './server/src/http/feedbackApi.js';
import { valuesApiRouter } from './server/src/http/valuesApi.js';
import { createContext } from './server/src/trpc.js';
import { db } from './server/src/db.js';
import { inboundEmails } from './server/src/db/schema/email.js';
import { users, jobDescriptions } from './server/src/db/schema/index.js';
import { readDoc } from './server/src/services/dropboxDocs.js';
import { eq, sql } from 'drizzle-orm';
import { pool, db } from './server/src/db.js';
import * as backupService from './server/src/services/backup.js';
import { runRealJobs } from './server/src/seedRealJobs.js';
import { backfillTestScores } from './server/src/services/postAssessmentReview.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { inspect } from 'node:util';
import { env } from './server/src/env.js';
import { getSessionMiddleware, verifyToken } from './server/src/auth.js';
import { registerBuiltInJobs, startCronJobs } from './server/src/services/job-runner.js';
import { registerHiringJobs, applyReportSchedules } from './server/src/services/hiring-scheduler.js';
import { verifyZoomWebhook, handleZoomRecordingReady } from './server/src/services/zoomService.js';
import { verifyCalendlySignature, applyCalendlyEvent } from './server/src/services/calendly.js';
import { parseCriteriaWebhook } from './server/src/services/criteriaCorp.js';
import { uploadFile, downloadFile, deleteFile } from './server/src/services/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = env.NODE_ENV === 'production';
const PORT = env.PORT;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const MIGRATIONS_FOLDER = path.join(__dirname, 'server/drizzle/migrations');

async function applyMigrationsWithRetry(maxAttempts = 20, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[boot] Applying database migrations (attempt ${attempt}/${maxAttempts})...`);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      console.log('[boot] Migrations up to date.');
      return;
    } catch (err) {
      // Inspect the full error tree — pg surfaces ECONNREFUSED nested inside
      // an AggregateError.errors[], which a shallow String(cause) misses.
      const detail = inspect(err, { depth: 8 });
      const transient = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|getaddrinfo|Connection terminated/.test(detail);
      if (attempt < maxAttempts && transient) {
        console.warn(`[boot] DB not reachable yet — retrying in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      console.error('[boot] Migration failed — aborting startup:', err);
      process.exit(1);
    }
  }
}

async function main() {
  // ── Apply pending DB migrations before serving (migrate-on-boot) ──
  // Retries transient connection errors: Railway's private network can take
  // a few seconds to come up at container start, so the first migrate()
  // attempts may hit ECONNREFUSED. Fails loudly only after exhausting retries.
  await applyMigrationsWithRetry();

  // Always ensure the 20 real Lightspeed roles (the reusable JD library) exist.
  // runRealJobs() is idempotent: it seeds only when its marker role is missing, so
  // a wiped/reset JD library is restored on boot and never double-seeded. The seeded
  // roles are hidden from the intake/roles list (see requisitions.list) while Draft,
  // so restoring the library does NOT clutter the user's own intakes. Non-fatal.
  try {
    await runRealJobs();
  } catch (e) {
    console.error('[boot] job-description seed failed (non-fatal):', e);
  }

  // Test-data backfill: give hand-advanced candidates simulated upstream scores
  // (work sample / resume review) for the stages they've already passed. Null-only.
  try {
    await backfillTestScores(db);
  } catch (e) {
    console.error('[boot] test-data score backfill failed (non-fatal):', e);
  }

  // ── Automatic daily database backups (best-effort) ──
  // Snapshots all tables to a local backup file + prunes per retention policy.
  // NOTE: Railway's container disk is ephemeral — these survive within a running
  // deployment (restore/download via Settings → Backups) but NOT a redeploy/DB
  // reset. Enable Railway's managed Postgres backups for cross-reset durability.
  const runScheduledBackup = async () => {
    try {
      await backupService.createBackup(pool, 'scheduled');
      const p = backupService.pruneBackups();
      console.log(`[backup] scheduled backup created (pruned ${p.pruned}, kept ${p.kept}).`);
    } catch (e) {
      console.error('[backup] scheduled backup failed:', e);
    }
  };
  setTimeout(runScheduledBackup, 60_000);                 // ~1 min after boot
  setInterval(runScheduledBackup, 24 * 60 * 60 * 1000);   // then daily


  const app = express();
  // Create the HTTP server explicitly so Vite's HMR WebSocket can piggy-
  // back on the same port instead of spawning its own listener on 24678.
  const httpServer = createHttpServer(app);

  app.set('trust proxy', 1);

  // ── CORS allowlist ──────────────────────────────────────────
  // The app is single-origin (Vite is mounted as Express middleware, so
  // the frontend and the /api routes share one origin) — legitimate
  // browser traffic is same-origin and needs no CORS at all. Because the
  // session cookie is now SameSite=None (required for Replit's preview
  // iframe), we must NOT reflect arbitrary origins with credentials, or
  // any site could make authenticated cross-site requests (CSRF). Allow
  // only Replit's own domains plus localhost; requests with no Origin
  // header (same-origin fetches, curl, server-to-server) always pass.
  const allowedOrigins = new Set<string>();
  if (process.env.REPLIT_DEV_DOMAIN) {
    allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  for (const d of (process.env.REPLIT_DOMAINS ?? '').split(',')) {
    const t = d.trim();
    if (t) allowedOrigins.add(`https://${t}`);
  }
  app.use(cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      return cb(null, false); // disallowed: cors lib omits ACAO, browser blocks it
    },
  }));

  // Skip JSON body parsing for file upload routes (handled by express.raw inline)
  app.use((req, res, next) => {
    if (req.path === '/api/upload/video' || req.path === '/api/webhooks/zoom' || req.path === '/api/webhooks/calendly') return next();
    express.json()(req, res, next);
  });

  // ── Auth — email/password + Postgres-backed sessions ──
  // express-session (connect-pg-simple) issues the session cookie; a
  // stateless HMAC bearer token covers cross-site-iframe contexts.
  app.use(getSessionMiddleware());

  app.use('/api/feedback', feedbackApiRouter);
  app.use('/api/values', valuesApiRouter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'template-app',
      version: '0.1.0',
      seedEmailConfigured: Boolean(env.SEED_SUPER_ADMIN_EMAIL),
    });
  });

  // ── Auth — login/register/logout are tRPC procedures (auth router) ──
  // The binary Express routes below resolve the user from the bearer
  // token (Authorization header) or the session cookie — same precedence
  // as createContext in trpc.ts.
  async function resolveSessionUser(
    req: Request,
  ): Promise<{ id: string; sub: string; role: string } | null> {
    let userId: string | undefined;
    const authz = req.headers.authorization;
    if (authz?.startsWith('Bearer ')) userId = verifyToken(authz.slice(7)) ?? undefined;
    if (!userId) userId = (req as any).session?.userId;
    if (!userId) return null;
    const rows = await pool.query(
      'SELECT id, sub, role, is_active FROM users WHERE id = $1',
      [userId],
    );
    const u = rows.rows[0];
    if (!u || !u.is_active) return null;
    return { id: u.id, sub: u.sub, role: u.role };
  }

  // ── File upload via Replit Object Storage (multipart) ──────
  app.post('/api/upload/video', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
      const user = await resolveSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const role = user.role;
      if (!role || !['admin', 'sysadmin'].includes(role)) {
        return res.status(403).json({ error: 'Forbidden — admin only' });
      }

      const filename = req.headers['x-filename'] as string;
      const mimeType = req.headers['content-type'] || 'application/octet-stream';
      if (!filename) {
        return res.status(400).json({ error: 'Missing x-filename header' });
      }

      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
      const key = `videos/${Date.now()}-${safe}`;

      const result = await uploadFile(key, req.body as Buffer);
      if (!result.ok) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        key: result.key,
        url: `/api/files/${result.key}`,
        mimeType,
        filename: safe,
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Work-sample file upload (per JD placeholder) ───────────
  app.post('/api/upload/work-sample', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
    try {
      const user = await resolveSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const role = user.role;
      if (!role || !['admin', 'sysadmin'].includes(role)) {
        return res.status(403).json({ error: 'Forbidden — admin only' });
      }

      const rawFilename = req.headers['x-filename'] as string;
      const mimeType = req.headers['content-type'] || 'application/octet-stream';
      if (!rawFilename) {
        return res.status(400).json({ error: 'Missing x-filename header' });
      }
      let filename = rawFilename;
      try { filename = decodeURIComponent(rawFilename); } catch { /* keep raw if not encoded */ }
      const safe = filename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200);

      const buf = req.body as Buffer;
      if (!buf || !buf.length) {
        return res.status(400).json({ error: 'Empty file' });
      }

      // Stored in Postgres (the app runs on Railway, where Replit object
      // storage is unavailable). base64 in a text column; served back via
      // /api/uploaded/:key.
      const key = crypto.randomUUID();
      await pool.query(
        'INSERT INTO uploaded_files (key, filename, mime_type, data) VALUES ($1, $2, $3, $4)',
        [key, safe, mimeType, buf.toString('base64')],
      );

      res.json({ success: true, key, url: `/api/uploaded/${key}`, mimeType, filename: safe });
    } catch (err: any) {
      console.error('Work-sample upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Serve DB-stored uploads (work samples) ─────────────────
  app.get('/api/uploaded/:key', async (req, res) => {
    try {
      const user = await resolveSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      const key = req.params.key;
      const r = await pool.query('SELECT filename, mime_type, data FROM uploaded_files WHERE key = $1', [key]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: 'File not found' });
      const buf = Buffer.from(row.data as string, 'base64');
      res.setHeader('Content-Type', (row.mime_type as string) || 'application/octet-stream');
      if (row.filename) {
        res.setHeader('Content-Disposition', `inline; filename="${String(row.filename).replace(/"/g, '')}"`);
      }
      res.send(buf);
    } catch (err: any) {
      console.error('Uploaded file serve error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Serve files from Object Storage ────────────────────────
  app.get('/api/files/*', async (req, res) => {
    try {
      // Auth gate: candidate files (resumes, videos, uploads) are staff-only.
      const user = await resolveSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const key = req.params[0];
      if (!key) return res.status(400).json({ error: 'Missing key' });

      const result = await downloadFile(key);
      if (!result.ok) {
        return res.status(404).json({ error: 'File not found' });
      }

      const ext = key.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
        mkv: 'video/x-matroska', ogg: 'video/ogg',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
        pdf: 'application/pdf',
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(result.buffer);
    } catch (err: any) {
      console.error('File serve error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Backup file download — sysadmin-only
  app.get('/api/backups/:filename/download', async (req, res) => {
    try {
      const user = await resolveSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      if (user.role !== 'sysadmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const filename = req.params.filename;
      if (!/^[\w-]+\.db$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const filepath = path.join(__dirname, 'backups', filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Backup not found' });
      }
      res.download(filepath, filename);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // ── Criteria Corp webhook — assessment completed ──────────
  app.post('/api/webhooks/criteria', async (req, res) => {
    const payload = parseCriteriaWebhook(req.body);
    if (!payload || payload.event !== 'assessment.completed') {
      return res.json({ received: true, skipped: true });
    }

    res.json({ received: true }); // Acknowledge immediately

    // Find candidate by criteriaCorpId and store scores
    import('./server/src/db.js').then(async ({ db }) => {
      const { eq } = await import('drizzle-orm');
      const { candidates } = await import('./server/src/db/schema/hiring.js');

      const candidate = await db.query.candidates.findFirst({
        where: eq(candidates.criteriaCorpId, payload.applicantId),
      });

      if (!candidate) {
        console.warn('[Criteria] No candidate found for applicantId:', payload.applicantId);
        return;
      }

      const { analyzeEpp } = await import('./server/src/services/eppAnalyzer.js');
      const jd = candidate.jdId
        ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const requiredValues = Array.isArray(jd?.eppValues) ? jd.eppValues : [];

      const eppAnalysis = payload.scores.epp
        ? analyzeEpp(payload.scores.epp, requiredValues as string[])
        : null;

      await db.update(candidates).set({
        ccatScore:             payload.scores.ccat?.rawScore ?? undefined,
        eppProfile:            payload.scores.epp ?? undefined,
        eppValuesMatchScore:   eppAnalysis?.score ?? undefined,
        assessmentCompletedAt: new Date(payload.completedAt),
        updatedAt:             new Date(),
      }).where(eq(candidates.id, candidate.id));

      console.log('[Criteria] Scores saved for candidate:', candidate.id);

      // Automatic pass/fail decision now that the CCAT score is stored.
      // (SendGrid advance/rejection emails fire inside.)
      try {
        const { applyAssessmentDecision } = await import('./server/src/services/assessmentDecision.js');
        await applyAssessmentDecision(db, candidate.id);
      } catch (e) {
        console.error('[Criteria] assessment decision failed:', e);
      }
    }).catch((err) => console.error('[Criteria] Webhook handler error:', err));
  });

  // ── Zoom webhook — recording ready ────────────────────────
  app.post('/api/webhooks/zoom', express.raw({ type: '*/*' }), async (req, res) => {
    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

    // Handle Zoom URL validation challenge (one-time setup ping)
    const rawBody = req.body.toString('utf8');
    let parsed: any;
    try { parsed = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    if (parsed.event === 'endpoint.url_validation') {
      const hashForValidate = crypto
        .createHmac('sha256', secret ?? '')
        .update(parsed.payload.plainToken)
        .digest('hex');
      return res.json({ plainToken: parsed.payload.plainToken, encryptedToken: hashForValidate });
    }

    // Verify signature on all other events
    if (secret) {
      const timestamp = req.headers['x-zm-request-timestamp'] as string;
      const signature = req.headers['x-zm-signature'] as string;
      if (!timestamp || !signature || !verifyZoomWebhook(rawBody, timestamp, signature, secret)) {
        console.warn('[Zoom] Webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      console.warn('[Zoom] ZOOM_WEBHOOK_SECRET_TOKEN not set — skipping signature check');
    }

    // Only handle recording.completed events
    if (parsed.event !== 'recording.completed') {
      return res.json({ received: true, skipped: true });
    }

    res.json({ received: true }); // Acknowledge immediately before async work

    handleZoomRecordingReady(parsed).catch((err) => {
      console.error('[Zoom] handleZoomRecordingReady error:', err);
    });
  });

  // ── Calendly webhook — interview booked / canceled ────────
  app.post('/api/webhooks/calendly', express.raw({ type: '*/*' }), async (req, res) => {
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    const rawBody = req.body.toString('utf8');
    let parsed: any;
    try { parsed = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    if (!signingKey) {
      console.warn('[Calendly] CALENDLY_WEBHOOK_SIGNING_KEY not set — rejecting webhook');
      return res.status(503).json({ error: 'Calendly not configured' });
    }
    const sig = req.headers['calendly-webhook-signature'] as string | undefined;
    if (!verifyCalendlySignature(rawBody, sig, signingKey)) {
      console.warn('[Calendly] Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    res.json({ received: true }); // acknowledge before async work

    applyCalendlyEvent(parsed.event, parsed.payload).catch((err) => {
      console.error('[Calendly] applyCalendlyEvent error:', err);
    });
  });

  // ── SendGrid Inbound Parse → test inbox (real candidate replies: later phase) ──
  // Accepts JSON or urlencoded posts now (simulate + curl/Postman). Real
  // SendGrid multipart Inbound Parse adds a multipart parser in the receiving
  // phase, once the reply subdomain + MX record are live.
  app.post('/api/webhooks/inbound-email', express.urlencoded({ extended: true, limit: '15mb' }), async (req, res) => {
    // Auth: require a shared secret (query ?key= or x-inbound-key header). Fail
    // closed when INBOUND_EMAIL_SECRET is unset, so this endpoint cannot be used
    // to inject messages into the inbox. Set the secret and include it in the
    // SendGrid Inbound Parse POST URL when the reply subdomain goes live.
    const inboundSecret = process.env.INBOUND_EMAIL_SECRET;
    const providedKey = (typeof req.query.key === 'string' ? req.query.key : undefined) ?? req.header('x-inbound-key') ?? undefined;
    if (!inboundSecret || providedKey !== inboundSecret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    try {
      const b: any = req.body || {};
      const to: string | null = b.to || b.envelope_to || null;
      const tag = typeof to === 'string' && to.includes('+') ? (to.split('+')[1]?.split('@')[0] ?? null) : null;
      await db.insert(inboundEmails).values({
        fromEmail: (b.from || 'unknown@unknown').toString().slice(0, 320),
        toEmail: to ? to.toString().slice(0, 320) : null,
        subject: (b.subject || '(no subject)').toString().slice(0, 500),
        body: (b.text || b.html || '').toString(),
        replyTag: tag,
        source: 'webhook',
        raw: b,
      });
    } catch (err) {
      console.error('[inbound-email] failed to store:', err);
    }
    res.status(200).json({ ok: true }); // always 200 so SendGrid does not retry-storm
  });

  // ── Document Index: serve a module doc fetched live from Dropbox ──
  // Renders HTML in the browser. Admin-only (session role check). The path is
  // validated against the module base inside readDoc().
  app.get('/api/admin/doc-index/file', async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).send('Not signed in.');
      const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!u || !['admin', 'sysadmin'].includes((u as any).role)) return res.status(403).send('Admins only.');
      const p = typeof req.query.path === 'string' ? req.query.path : '';
      if (!p) return res.status(400).send('Missing path.');
      const content = await readDoc(p);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(content);
    } catch (err: any) {
      res.status(502).send('Failed to load document: ' + (err?.message ?? 'error'));
    }
  });

  app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext }));

  // ── Frontend serving ─────────────────────────────────────────
  // Dev: Vite as Express middleware — single process, single port (no
  // separate Vite dev server). This sidesteps Replit's port auto-detect
  // creating a duplicate externalPort=80 mapping between Express (3001)
  // and Vite (5000) that broke the Preview iframe.
  //
  // Prod: serve the built SPA from dist/.
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      // Pass our http.Server so Vite's HMR WebSocket upgrades on the
      // same port (no separate 24678 listener). Combined with
      // server.hmr.clientPort=443 in vite.config.js, the browser in
      // Replit's iframe can reach HMR via wss://<host>:443 cleanly.
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
      configFile: path.resolve(__dirname, 'vite.config.js'),
    });
    app.use(vite.middlewares);
  } else {
    const buildDir = fs.existsSync(path.join(__dirname, 'dist', 'index.html')) ? 'dist' : 'build-output';
    const resolvedBuildDir = path.join(__dirname, buildDir);
    console.log(`Static files: ${resolvedBuildDir} (exists: ${fs.existsSync(path.join(resolvedBuildDir, 'index.html'))})`);
    app.use(express.static(resolvedBuildDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(resolvedBuildDir, 'index.html'));
    });
  }

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Express error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  });

  registerBuiltInJobs();
  registerHiringJobs();
  startCronJobs(db)
    .then(() => applyReportSchedules())
    .catch((err) => console.error('[boot] failed to start cron / apply report schedules:', err));

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Template App running on port ${PORT} [${isProduction ? 'production' : 'development'}]`);
    console.log(`[boot] Seed admin email: ${env.SEED_SUPER_ADMIN_EMAIL || '(unset)'}`);
    if (!isProduction) {
      console.log(`[boot] Vite middleware mode — HMR WS on the same port as Express`);
    }
  });
}

main().catch((err) => {
  console.error('[boot] fatal:', err);
  process.exit(1);
});
