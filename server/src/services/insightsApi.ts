// ============================================================
// INSIGHTS DISCOVERY API CLIENT
// Pulls a person's Colour Dynamics energies directly from the
// Insights Profiles API (by email) so profiles can populate
// automatically — no manual PDF upload.
//
// Auth: AWS Signature v4 (service execute-api, region eu-west-1
// by default), per Insights' developer docs. All settings come
// from env; when credentials are absent, isConfigured() is false
// and callers fall back to manual upload.
//
// NOTE: Insights' full response schema lives behind their
// developer portal. mapInsightsProfile() is deliberately
// tolerant — it looks for the colour energies under several
// likely shapes and should be confirmed against a real response
// once credentials are live (raw payload is returned for that).
// ============================================================

import aws4 from 'aws4';
import { env } from '../env.js';
import type { ColourEnergies } from '../db/schema/insightsDiscovery.js';

export interface InsightsProfile {
  conscious: ColourEnergies | null;
  lessConscious: ColourEnergies | null;
  typeNumber: number | null;
  typeName: string | null;
  lcTypeNumber: number | null;
  lcTypeName: string | null;
}

export function isConfigured(): boolean {
  return Boolean(
    env.INSIGHTS_API_BASE_URL &&
    env.INSIGHTS_API_ACCESS_KEY_ID &&
    env.INSIGHTS_API_SECRET_ACCESS_KEY,
  );
}

function num(v: any): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

// Pull a { blue, green, yellow, red } style object out of whatever
// shape the API returns for a persona's energies (raw 0–6 + percent).
function energiesFrom(obj: any): ColourEnergies | null {
  if (!obj || typeof obj !== 'object') return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      for (const actual of Object.keys(obj)) {
        if (actual.toLowerCase() === k) return obj[actual];
      }
    }
    return undefined;
  };
  const blue = pick('blue', 'coolblue', 'cool_blue');
  const green = pick('green', 'earthgreen', 'earth_green');
  const yellow = pick('yellow', 'sunshineyellow', 'sunshine_yellow');
  const red = pick('red', 'fieryred', 'fiery_red');
  if ([blue, green, yellow, red].every((v) => v === undefined)) return null;

  // Each colour may be a number (percent or raw) or a sub-object {raw, percent}.
  const raw = (v: any) => (v && typeof v === 'object') ? num(v.raw ?? v.value ?? v.score) : num(v);
  const pct = (v: any) => (v && typeof v === 'object') ? num(v.percent ?? v.percentage ?? v.pct) : num(v);
  // If the value is a bare number we can't tell raw vs percent; assume percent
  // if it is >6, else raw and derive percent from the 0–6 scale.
  const norm = (v: any) => {
    if (v && typeof v === 'object') return { raw: raw(v), pct: pct(v) };
    const n = num(v);
    return n > 6 ? { raw: +(n / 100 * 6).toFixed(2), pct: Math.round(n) }
                 : { raw: n, pct: Math.round((n / 6) * 100) };
  };
  const b = norm(blue), g = norm(green), y = norm(yellow), r = norm(red);
  return {
    blue: b.raw, green: g.raw, yellow: y.raw, red: r.raw,
    bluePct: b.pct, greenPct: g.pct, yellowPct: y.pct, redPct: r.pct,
  };
}

export function mapInsightsProfile(raw: any): InsightsProfile {
  // Unwrap common envelope shapes.
  const p = raw?.profile ?? raw?.data ?? (Array.isArray(raw?.profiles) ? raw.profiles[0] : raw) ?? raw;
  const cd = p?.colourDynamics ?? p?.colorDynamics ?? p?.colourEnergies ?? p ?? {};
  const conscious = energiesFrom(cd.conscious ?? cd.persona ?? cd.consciousPersona ?? cd);
  const lessConscious = energiesFrom(cd.lessConscious ?? cd.less_conscious ?? cd.lessConsciousPersona);
  const wheel = p?.wheel ?? p?.typeWheel ?? {};
  return {
    conscious,
    lessConscious,
    typeNumber: num(wheel.consciousPosition ?? wheel.conscious ?? p?.typeNumber) || null,
    typeName: (wheel.consciousType ?? p?.typeName ?? null) || null,
    lcTypeNumber: num(wheel.lessConsciousPosition ?? wheel.lessConscious ?? p?.lcTypeNumber) || null,
    lcTypeName: (wheel.lessConsciousType ?? p?.lcTypeName ?? null) || null,
  };
}

/**
 * Fetch one person's profile by email. Returns the mapped profile plus
 * the raw payload (so the mapping can be verified/adjusted when live).
 */
export async function fetchProfileByEmail(
  email: string,
): Promise<{ ok: true; profile: InsightsProfile; raw: any } | { ok: false; error: string }> {
  if (!isConfigured()) {
    return { ok: false, error: 'Insights API is not configured (missing credentials).' };
  }
  try {
    const base = new URL(env.INSIGHTS_API_BASE_URL);
    const path = `${env.INSIGHTS_API_PROFILE_PATH}?email=${encodeURIComponent(email)}`;
    const opts: any = {
      host: base.host,
      path,
      service: env.INSIGHTS_API_SERVICE,
      region: env.INSIGHTS_API_REGION,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
    aws4.sign(opts, {
      accessKeyId: env.INSIGHTS_API_ACCESS_KEY_ID,
      secretAccessKey: env.INSIGHTS_API_SECRET_ACCESS_KEY,
    });
    const res = await fetch(`${base.origin}${path}`, { method: 'GET', headers: opts.headers });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Insights API ${res.status}: ${text.slice(0, 300)}` };
    }
    let raw: any;
    try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Insights API returned non-JSON.' }; }
    const profile = mapInsightsProfile(raw);
    if (!profile.conscious && !profile.lessConscious) {
      return { ok: false, error: 'No colour-energy data found for that email (has the evaluator been completed?).' };
    }
    return { ok: true, profile, raw };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Insights API request failed.' };
  }
}
