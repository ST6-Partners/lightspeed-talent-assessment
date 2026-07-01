/**
 * Typed, validated environment loader for Template App.
 *
 * Strategy: fail soft with safe dev defaults, but the two values that
 * matter in every environment are DATABASE_URL (Postgres) and
 * SESSION_SECRET (signs session cookies + bearer tokens — rotate and all
 * sessions/tokens are invalidated). ANTHROPIC_API_KEY is optional; when
 * absent, the chat falls back to canned/demo responses.
 */

export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET: string;
  SEED_SUPER_ADMIN_EMAIL: string;
  // Insights Discovery API (optional; when unset, auto-sync is disabled and
  // the UI falls back to manual PDF upload). Auth is AWS SigV4.
  INSIGHTS_API_BASE_URL: string;      // e.g. https://api.insights.com
  INSIGHTS_API_PROFILE_PATH: string;  // e.g. /v1/profiles (query by email)
  INSIGHTS_API_ACCESS_KEY_ID: string;
  INSIGHTS_API_SECRET_ACCESS_KEY: string;
  INSIGHTS_API_REGION: string;        // default eu-west-1
  INSIGHTS_API_SERVICE: string;       // default execute-api
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export function loadEnv(): Env {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as Env['NODE_ENV'];
  // Default port is 5000 — matches Replit's default dev workflow which
  // expects the single HTTP process on 5000. Override with PORT env var
  // for other environments.
  const port = Number(optional('PORT', '5000'));

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: optional('DATABASE_URL', 'postgresql://localhost:5432/template_app'),
    ANTHROPIC_API_KEY: optional('ANTHROPIC_API_KEY'),
    SESSION_SECRET: optional('SESSION_SECRET', 'dev-only-session-secret-32-chars-xxxxxxxxxxxx'),
    SEED_SUPER_ADMIN_EMAIL: optional('SEED_SUPER_ADMIN_EMAIL').toLowerCase(),
    INSIGHTS_API_BASE_URL: optional('INSIGHTS_API_BASE_URL'),
    INSIGHTS_API_PROFILE_PATH: optional('INSIGHTS_API_PROFILE_PATH', '/profiles'),
    INSIGHTS_API_ACCESS_KEY_ID: optional('INSIGHTS_API_ACCESS_KEY_ID'),
    INSIGHTS_API_SECRET_ACCESS_KEY: optional('INSIGHTS_API_SECRET_ACCESS_KEY'),
    INSIGHTS_API_REGION: optional('INSIGHTS_API_REGION', 'eu-west-1'),
    INSIGHTS_API_SERVICE: optional('INSIGHTS_API_SERVICE', 'execute-api'),
  };
}

export const env = loadEnv();
