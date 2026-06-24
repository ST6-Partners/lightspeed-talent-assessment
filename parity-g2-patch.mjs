// Parity G2 — register the approve router + widen resolved_by_type.
// Self-verifying + idempotent. Run from repo root: node parity-g2-patch.mjs
import fs from 'fs';

function patch(file, name, marker, anchor, repl) {
  if (!fs.existsSync(file)) { console.error(`  [MISS] ${file}`); process.exitCode = 1; return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(marker)) { console.log(`  [skip] ${name} (already applied)`); return; }
  if (!s.includes(anchor)) { console.error(`  [FAIL] ${name} — ANCHOR NOT FOUND`); process.exitCode = 1; return; }
  fs.writeFileSync(file, s.replace(anchor, repl));
  console.log(`  [ok]   ${name}`);
}

// 1. Widen resolved_by_type so 'pm_approved' / 'pm_dismissed' fit (was length 10).
patch(
  'server/src/db/schema/feedback.ts',
  'widen resolved_by_type -> 20',
  "resolved_by_type', { length: 20 }",
  "varchar('resolved_by_type', { length: 10 })",
  "varchar('resolved_by_type', { length: 20 })",
);

// 2. Import the approve router in the root router.
patch(
  'server/src/router.ts',
  'import feedbackApproveRouter',
  'feedbackApproveRouter',
  "import { agentRouter } from './routers/agent.js';",
  "import { agentRouter } from './routers/agent.js';\nimport { feedbackApproveRouter } from './routers/feedbackApprove.js';",
);

// 3. Register it under `feedbackApprove`.
patch(
  'server/src/router.ts',
  'register feedbackApprove',
  'feedbackApprove: feedbackApproveRouter',
  '  agent: agentRouter,',
  '  agent: agentRouter,\n  feedbackApprove: feedbackApproveRouter,',
);

console.log('\nParity G2 patch complete.');
