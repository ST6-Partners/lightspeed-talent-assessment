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
import { env } from './server/src/env.js';
import { getSessionMiddleware, verifyToken } from './server/src/auth.js';
import { registerBuiltInJobs } from './server/src/services/job-runner.js';
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

async function main() {
  // ── Apply pending DB migrations before serving (migrate-on-boot) ──
  // Runs inside the app container (DATABASE_URL reachable here), applies
  // committed SQL migrations idempotently, and fails loudly if the DB
  // isn't reachable rather than serving an empty schema.
  try {
    console.log('[boot] Applying database migrations...');
    await migrate(db, { migrationsFolder: path.join(__dirname, 'server/drizzle/migrations') });
    console.log('[boot] Migrations up to date.');
  } catch (err) {
    console.error('[boot] Migration failed — aborting startup:', err);
    process.exit(1);
  }

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
    if (req.path === '/api/upload/video') return next();
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
