/**
 * Auth — simple email/password + Postgres-backed sessions.
 *
 * Live path (Sequence 3, 2026-06-05): express-session (connect-pg-simple
 * store) + bcryptjs for password hashing, plus a stateless HMAC bearer
 * token for Replit's cross-site iframe (where the session cookie is
 * blocked as third-party). The former WorkOS integration
 * (@st6-partners/auth-verify) has been fully removed.
 *
 * The surface the rest of the app depends on is unchanged — ctx.user is
 * resolved in trpc.ts from req.session.userId or the bearer token.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db.js';
import { env } from './env.js';

// ── Session typing — req.session.userId ──────────────────────
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// ── Password hashing (bcryptjs) ──────────────────────────────
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Bearer tokens (stateless, HMAC-signed) ───────────────────
// Replit shows the app inside a cross-site iframe; browsers block the
// session cookie there as a third-party cookie even with SameSite=None.
// So the primary auth path is a bearer token the client keeps in
// localStorage and sends in the Authorization header — not subject to
// cookie policies. Token = base64url(`userId.expiryMs`).hmacSig.
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function mintToken(userId: string): string {
  const payload = `${userId}.${Date.now() + TOKEN_TTL_MS}`;
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const sep = payload.lastIndexOf('.');
  const userId = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!userId || !exp || Date.now() > exp) return null;
  return userId;
}

// ── Session middleware (Postgres-backed via connect-pg-simple) ──
let sessionMw: ReturnType<typeof session> | null = null;
export function getSessionMiddleware() {
  if (sessionMw) return sessionMw;
  const PgStore = connectPgSimple(session);
  sessionMw = session({
    store: new PgStore({
      pool,
      createTableIfMissing: true,   // creates the auth_sessions table on first run
      tableName: 'auth_sessions',
    }),
    name: 'tmpl.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Replit serves the app through an HTTPS proxy and the preview is
      // shown inside a cross-site iframe. For the session cookie to be
      // stored AND sent back from that iframe, it must be SameSite=None
      // with Secure. `trust proxy` (set in server.ts) lets express-session
      // recognise the proxied connection as secure so the cookie is issued.
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  });
  return sessionMw;
}
