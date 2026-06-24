// ============================================================
// AUTH ADAPTER — thin re-export site for the app's auth surface.
//
// The live auth is email/password + Postgres-backed sessions
// (express-session/connect-pg-simple) with an HMAC bearer token for
// cross-site-iframe contexts. Consumer code that wants a single import
// site for auth helpers can import from here; the implementation lives
// in server/src/auth.ts.
// ============================================================

export {
  getSessionMiddleware,
  hashPassword,
  verifyPassword,
  mintToken,
  verifyToken,
} from '../server/src/auth.js';
