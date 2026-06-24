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
  };
}

export const env = loadEnv();
