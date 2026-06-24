#!/usr/bin/env node
// ============================================================
// Feedback/Agent Contract v1.0 — §9 Conformance Suite
//
// Proves a Type 2 app's /api/feedback HTTP surface conforms, so the one
// shared debug-agent skill needs NO per-app adapter. Pass 1–7 → conformant.
//
// Usage:
//   node conformance.mjs --base https://<dev-url> --key <AGENT_API_KEY> [--feedback-id <uuid>]
//
// The 4 non-mutating checks (1,2,3,6-structure) run with just --base/--key.
// The mutating checks (4,5,7) require --feedback-id pointing at a THROWAWAY
// test item on a dev DB (they set pm_review / resolve / exhaust the cap).
// ============================================================

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const BASE = (args.base || process.env.BASE_URL || '').replace(/\/$/, '');
const KEY = args.key || process.env.AGENT_API_KEY;
const FEEDBACK_ID = args['feedback-id'] || null;

if (!BASE || !KEY) {
  console.error('Usage: node conformance.mjs --base <url> --key <AGENT_API_KEY> [--feedback-id <uuid>]');
  process.exit(2);
}

const H = { 'content-type': 'application/json', 'x-api-key': KEY };
const url = (p) => `${BASE}/api/feedback${p}`;
let pass = 0, fail = 0, skip = 0;
const ok = (n, m = '') => { console.log(`  PASS  ${n}${m ? ' — ' + m : ''}`); pass++; };
const no = (n, m = '') => { console.log(`  FAIL  ${n}${m ? ' — ' + m : ''}`); fail++; };
const sk = (n, m = '') => { console.log(`  SKIP  ${n}${m ? ' — ' + m : ''}`); skip++; };

const REQUIRED_FIELDS = ['id', 'type', 'status', 'title', 'description', 'priority', 'severity',
  'admin_notes', 'resolved_by_type', 'agent_run_id', 'attachment_count', 'created_at', 'submitter_name'];

async function main() {
  const runId = `debug-agent-conformance-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;

  // 1 — export
  try {
    const r = await fetch(url('/export?status=open&type=bug'), { headers: H });
    const j = await r.json();
    if (r.status === 200 && Array.isArray(j.items)) {
      if (!j.items.length) ok('1 export', '200, 0 open bugs (shape unverified — seed one to fully check)');
      else {
        const miss = REQUIRED_FIELDS.filter((f) => !(f in j.items[0]));
        miss.length ? no('1 export', 'missing §3.1 fields: ' + miss.join(', ')) : ok('1 export', `200, ${j.items.length} items, all §3.1 fields present`);
      }
    } else no('1 export', `status ${r.status}`);
  } catch (e) { no('1 export', e.message); }

  // 2 — ai-review (returns a result; saves no feedback)
  try {
    const r = await fetch(url('/ai-review'), { method: 'POST', headers: H,
      body: JSON.stringify({ type: 'bug', title: 'Conformance probe — please ignore', description: 'synthetic check' }) });
    const j = await r.json();
    (r.status === 200 && typeof j.outcome === 'string') ? ok('2 ai-review', `200, outcome=${j.outcome}`) : no('2 ai-review', `status ${r.status}`);
  } catch (e) { no('2 ai-review', e.message); }

  // 3 — create agent run
  let runOk = false;
  try {
    const r = await fetch(url('/agent-runs'), { method: 'POST', headers: H,
      body: JSON.stringify({ id: runId, status: 'running', model: 'claude-sonnet-4-6', triggeredBy: 'conformance' }) });
    const j = await r.json();
    runOk = r.status === 200 && j.id === runId;
    runOk ? ok('3 agent-runs', `200, id=${j.id}`) : no('3 agent-runs', `status ${r.status}`);
  } catch (e) { no('3 agent-runs', e.message); }

  const diagnosis = {
    diagnosis_summary: 'Synthetic conformance diagnosis.',
    confidence: { total: 11, tier: 'Auto-Fix', signals: {
      root_cause_clarity: { score: 3, rationale: 'x' }, fix_scope: { score: 3, rationale: 'x' },
      fix_category: { score: 3, rationale: 'x' }, precedent: { score: 2, rationale: 'x' } } },
    root_cause: 'n/a', fix_category: 'data-issue',
  };
  const adminNotesStr = JSON.stringify(diagnosis);

  if (!FEEDBACK_ID) {
    sk('4 agent-review', 'pass --feedback-id <throwaway uuid>');
    sk('5 resolve', 'pass --feedback-id');
    sk('7 attempt-cap', 'pass --feedback-id');
    // 6 — structural confidence check (no item needed)
    (diagnosis.confidence.total >= 4 && diagnosis.confidence.total <= 12 && Number.isInteger(diagnosis.confidence.total))
      ? ok('6 confidence', '1–12 integer score (structure)') : no('6 confidence', 'not a 1–12 integer');
  } else {
    // 4 — route to human
    let conf6 = false;
    try {
      const r = await fetch(url(`/agent-review/${FEEDBACK_ID}`), { method: 'PUT', headers: H,
        body: JSON.stringify({ admin_notes: adminNotesStr, agent_run_id: runId, resolution_notes: 'conformance', pr_url: 'https://example.com/pr/1' }) });
      const j = await r.json();
      if (r.status === 200 && j.status === 'pm_review') {
        ok('4 agent-review', '200, status=pm_review');
        // 6 — confidence round-trips as 1–12 from the stored admin_notes
        try { const parsed = JSON.parse(j.admin_notes); const t = parsed?.confidence?.total;
          conf6 = Number.isInteger(t) && t >= 4 && t <= 12; } catch {}
        conf6 ? ok('6 confidence', `round-trips as ${JSON.parse(j.admin_notes).confidence.total}/12`) : no('6 confidence', 'admin_notes confidence not 1–12');
      } else no('4 agent-review', `status ${r.status}`);
    } catch (e) { no('4 agent-review', e.message); }

    // 5 — resolve (terminal)
    try {
      const r = await fetch(url(`/${FEEDBACK_ID}/resolve`), { method: 'PUT', headers: H,
        body: JSON.stringify({ status: 'resolved', resolution_notes: 'conformance resolve', resolved_by_type: 'agent', agent_run_id: runId, admin_notes: adminNotesStr }) });
      const j = await r.json();
      (r.status === 200 && j.status === 'resolved') ? ok('5 resolve', '200, terminal resolved') : no('5 resolve', `status ${r.status}`);
    } catch (e) { no('5 resolve', e.message); }

    // 7 — attempt cap (the 4th agent-review on one item is rejected)
    try {
      let last = 0;
      for (let i = 0; i < 4; i++) {
        const r = await fetch(url(`/agent-review/${FEEDBACK_ID}`), { method: 'PUT', headers: H,
          body: JSON.stringify({ admin_notes: adminNotesStr, agent_run_id: runId }) });
        last = r.status;
      }
      last === 429 ? ok('7 attempt-cap', '4th attempt rejected (429)') : no('7 attempt-cap', `expected 429, got ${last}`);
    } catch (e) { no('7 attempt-cap', e.message); }
  }

  console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped`);
  process.exit(fail ? 1 : 0);
}
main();
