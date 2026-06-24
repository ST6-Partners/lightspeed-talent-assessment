// ============================================================
// TELEMETRY SERVICE — automatic page-view tracking + explicit event helper
// Pattern: RCDO server/middleware/telemetry.js
//
// Two modes:
// 1. telemetryMiddleware() — tRPC middleware, auto-logs every
//    authenticated API call as a page_view event. Screen is inferred
//    from the x-screen header or the tRPC path.
// 2. trackActivity() — explicit fire-and-forget logger for business
//    events (archive_item, restore_item, login, export, etc.)
// ============================================================

import type { DrizzleClient } from '../db.js';
import { userActivityLog } from '../db/schema/telemetry.js';

// ── Screen inference from tRPC path ──────────────────────────
// Maps tRPC procedure prefixes to screen names.
// Adopters extend this map for their domain routes.
const PATH_TO_SCREEN: Record<string, string> = {
  'entity.':        'entities',
  'admin.':         'admin',
  'system.':        'admin',
  'telemetry.':     'admin',
  'feedbackAdmin.': 'admin',
  'prompts.':       'admin',
  'releases.':      'admin',
  'onboardingVideos.': 'admin',
  'chat.':            'chat',
  'changelog.':     'changelog',
  'notifications.': 'notifications',
  'auth.':          'login',
};

function inferScreen(path: string, headerScreen?: string): string {
  if (headerScreen) return headerScreen;
  for (const [prefix, screen] of Object.entries(PATH_TO_SCREEN)) {
    if (path.startsWith(prefix)) return screen;
  }
  return 'unknown';
}

// ── Explicit event logger (fire-and-forget) ──────────────────

export async function trackActivity(
  db: DrizzleClient,
  userId: string,
  eventType: string,
  eventValue?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    await db.insert(userActivityLog).values({
      userId,
      eventType,
      eventValue: eventValue || null,
      metadata: metadata || null,
    });
  } catch (err: any) {
    console.warn('[Telemetry] Failed to log activity:', err.message);
  }
}

// ── tRPC-level auto-tracking middleware ───────────────────────
// Attach to protectedProcedure to auto-log API calls.
// Throttled: max 1 page_view per user per screen per 30 seconds.

const recentViews = new Map<string, number>();
const VIEW_THROTTLE_MS = 30_000;

export function createTelemetryMiddleware() {
  return async ({ ctx, next, path }: { ctx: any; next: () => Promise<any>; path: string }) => {
    // Only track authenticated users
    if (ctx.user?.id) {
      const screen = inferScreen(path, ctx.req?.headers?.['x-screen']);
      const throttleKey = `${ctx.user.id}:${screen}`;
      const now = Date.now();
      const last = recentViews.get(throttleKey) ?? 0;

      if (now - last >= VIEW_THROTTLE_MS) {
        recentViews.set(throttleKey, now);
        // Fire and forget — don't block the request
        trackActivity(ctx.db, ctx.user.id, 'page_view', screen).catch(() => {});
      }
    }
    return next();
  };
}
