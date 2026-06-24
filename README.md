# AI Talent Assessment

> AI-augmented hiring funnel for Lightspeed — automate top-of-funnel, concentrate human judgment on finalists. Scaffolded from `template-type2-app` (SP-002).

Production-ready starter scaffold for Type 2 applications. Clone, rename, and build.

## Stack

TypeScript end-to-end, React 18 + Vite, Express 4.x, tRPC, Drizzle ORM, PostgreSQL 15+, Tailwind CSS, Vercel AI SDK.

## Quick Start

```bash
# Auth — @st6-partners/auth-verify is a private GitHub Packages dep.
# Set NODE_AUTH_TOKEN to a GitHub PAT with `read:packages` scope BEFORE npm install:
export NODE_AUTH_TOKEN=ghp_your_packages_scoped_pat

npm install
cp .env.example .env   # Edit DATABASE_URL, ANTHROPIC_API_KEY, WORKOS_*, SESSION_SECRET
npm run db:push         # Create tables
npm run db:seed         # Seed user-independent data (feature flags, screen inventory)
npm run dev             # Start dev server (port 5173) + API (port 3001)
```

First user: sign in via WorkOS. If `SEED_SUPER_ADMIN_EMAIL` is set and matches the
signed-in email, that user is promoted to `sysadmin` automatically.

## What's Included

20 infrastructure tables, 8 pre-wired components (Claude Chat, Feedback, Telemetry, Change Log, Notifications, Permissions, Prompt Admin, Database Views), sample domain entity with full CRUD + audit logging, and Playwright test framework.

## Adopter Steps

1. Replace `sample_entities` with your domain table(s)
2. Update tRPC routers in `server/src/routers/`
3. Build domain screens in `src/pages/`
4. Add Claude tools in `adapters/ai.ts`
5. Run `npm run db:push` to apply schema changes

## Architecture

- `server.ts` — Express entry point + tRPC adapter + `/auth/{login,callback,logout}` routes
- `server/src/env.ts` — Typed env loader (fails fast on required keys; tolerates missing WORKOS_* in dev)
- `server/src/auth.ts` — `@st6-partners/auth-verify` client factory (single cached AuthClient)
- `server/src/db/schema/` — Drizzle schema
- `server/src/routers/` — tRPC routers
- `server/src/services/` — Permission service, audit service
- `src/` — React client (pages, components, hooks)
- `adapters/` — Swappable integrations (auth re-export, AI, audit)
- `client/e2e/` — Playwright tests

## Authentication

TMPL is the canonical reference integration for **Centralized Authentication** (DD-002, DD-005).
Identity is owned by WorkOS; the app verifies JWTs and manages sessions via
[`@st6-partners/auth-verify`](https://github.com/ST6-Partners/auth-verify).

- **Login flow:** `/auth/login` → WorkOS AuthKit → `/auth/callback` → session cookie set
- **Session:** `CookieSessionAdapter` (DD-007) — AES-256-GCM-sealed, stateless server-side
- **Role model:** App-level `user | manager | admin | sysadmin` stored locally. Library
  does **not** enforce authorization (per DD-001); the app does.
- **First user:** WorkOS creates the identity; on first authenticated request, the
  tRPC context upserts a row in `users` keyed by `sub` (WorkOS user ID). If the user's
  email matches `SEED_SUPER_ADMIN_EMAIL`, role is auto-set to `sysadmin`.
- **Legacy IDs (DD-006):** `externalId` column preserves pre-migration user IDs for apps
  that have them. TMPL has no legacy users, so it's always `null` here — included in
  the schema so consumer apps see the canonical shape.

### Required WorkOS configuration

Before running the app, set up WorkOS:

1. Create/claim the WorkOS account for your ST6 tenant.
2. Register an Application → copy `Client ID` and `Client Secret` into `.env`.
3. Enable AuthKit on the application.
4. Add the redirect URI matching `WORKOS_REDIRECT_URI` (default `http://localhost:3001/auth/callback`).
5. (Optional) Configure Enterprise Connections for Entra ID (workforce) and Entra B2B (contractor).
6. (Optional) Set custom claim mapping so `connection_type`, `connection_id`, and
   `external_id` are emitted in the JWT per the [JWT Claim Specification](https://github.com/ST6-Partners/auth-verify).

### GitHub Packages install

The library is published to GitHub Packages under `@st6-partners`. To install:

```bash
# One-time: create a PAT with `read:packages` scope at github.com/settings/tokens
export NODE_AUTH_TOKEN=ghp_...
npm install
```

`.npmrc` is committed and references `NODE_AUTH_TOKEN` — do NOT hardcode tokens.

## Design Decisions

16 formal design decisions govern this scaffold. See the Dreadnought documentation system for full DD records.
