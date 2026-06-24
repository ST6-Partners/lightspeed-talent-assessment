# AI Talent Assessment

## Overview
Express + tRPC backend with React + Vite frontend. Uses PostgreSQL via Drizzle ORM.

## Architecture
- **Backend**: Express server on port 3001 (`server.ts`) with tRPC API at `/api/trpc`
- **Frontend**: React + Vite dev server on port 5000 (proxies `/api` to backend on 3001)
- **Database**: PostgreSQL with Drizzle ORM (no pg session store — sessions live in cookies)
- **Styling**: Tailwind CSS + PostCSS
- **Auth**: WorkOS-backed via `@st6-partners/auth-verify` (CookieSessionAdapter). Identity owned by WorkOS; four-tier app-level role model (user/manager/admin/sysadmin) is local.

## Port Configuration
- Dev mode: Vite on 5000 (webview), Express on 3001
- Production: Express on 3001 serving built frontend from `dist/`
- Deployment forwards port 3001 → external port 80

## Key Files
- `server.ts` - Express server entry point
- `server/src/router.ts` - tRPC root router
- `server/src/trpc.ts` - tRPC context + procedures
- `server/src/db.ts` - Database connection pool
- `server/src/env.ts` - Typed env loader
- `server/src/auth.ts` - Shared auth-verify client factory
- `server/src/routers/auth.ts` - tRPC auth router (me, updateTimezone, admin user mgmt)
- `vite.config.js` - Vite config (dev server on port 5000, proxy to port 3001)
- `drizzle.config.ts` - Drizzle ORM config

## Scripts
- `npm run dev` - Start dev (concurrent backend + frontend)
- `npm run build` - Build frontend
- `npm run start` - Production build + serve
- `npm run db:push` - Push schema to DB
- `npm run db:migrate` - Run migrations
