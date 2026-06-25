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
import { createContext } from './server/src/trpc.js';
import { pool, db } from './server/src/db.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { inspect } from 'node:util';
import { env } from './server/src/env.js';
import { getSessionMiddleware, verifyToken } from './server/src/auth.js';
import { registerBuiltInJobs, startCronJobs } from './server/src/services/job-runner.js';
import { registerHiringJobs } from './server/src/services/hiring-scheduler.js';
import { verifyZoomWebhook, handleZoomRecordingReady } from './server/src/services/zoomService.js';
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
    if (req.path === '/api/upload/video' || req.path === '/api/webhooks/zoom') return next();
    express.json()(req, res, next);
  });

  // ── Auth — email/password + Postgres-backed sessions ──
  // express-session (connect-pg-simple) issues the session cookie; a
  // stateless HMAC bearer token covers cross-site-iframe contexts.
  app.use(getSessionMiddleware());

  app.use('/api/feedback', feedbackApiRouter);

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

  // ── Serve files from Object Storage ────────────────────────
  app.get('/api/files/*', async (req, res) => {
    try {
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
      res.setHeader('Cache-Control', 'public, max-age=86400');
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
  startCronJobs(db);

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
