---
name: Auth inside the Replit preview iframe
description: Why cookie-only sessions fail in the Replit preview and how to make auth work there
---

# Auth must not depend on cookies inside the Replit preview iframe

Cookie-based sessions (express-session etc.) silently fail when the app is used
in Replit's workspace preview, which embeds the app's `*.replit.dev` origin
inside a `replit.com` top-level page. That makes the app's cookies THIRD-PARTY.

What breaks (symptom): login "works" on the server, the page navigates to "/",
but the next request (e.g. auth.me) comes back unauthenticated, so the user is
bounced straight back to the login screen. NO console error is thrown — a
blocked cookie is silent. curl over localhost / the proxy works fine, which
makes it look like a frontend bug.

Why: modern browsers block third-party cookies by default (Safari always,
Chrome incognito + rollout). `SameSite=None; Secure` is necessary but NOT
sufficient — when third-party cookies are blocked entirely, even those are
dropped in the iframe.

**Fix that actually works:** use a bearer token, not (only) a cookie.
- Server mints an HMAC-signed token (signed with SESSION_SECRET) on
  login/register and returns it in the response body.
- Client stores it in localStorage and sends it as `Authorization: Bearer ...`
  on every request (tRPC httpBatchLink `headers()`).
- Server context reads the bearer token first, falls back to the session cookie
  (cookie path still works in a first-party / new-tab context).
- Logout clears the localStorage token (clearing the cookie alone is not
  enough since the token is the primary path).

**How to verify:** test against `$REPLIT_DEV_DOMAIN` over https with ONLY the
Authorization header and no cookie jar — that mimics the blocked-cookie iframe.
A tampered token must resolve to null (confirms HMAC check).

**Tradeoff:** localStorage tokens are readable by XSS (cookies can be httpOnly).
Accepted because httpOnly cookies simply don't function in the embedded preview.

**CORS caveat:** if you set SameSite=None you must NOT also reflect arbitrary
origins with credentials (`cors({ origin: true, credentials: true })`) — that
opens CSRF. Restrict CORS to an allowlist (Replit domains + localhost).
