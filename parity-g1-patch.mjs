// Parity G1 — make feedbackAdmin.list return the agent fields the cockpit needs.
// Self-verifying + idempotent. Run from repo root: node parity-g1-patch.mjs
import fs from 'fs';

const file = 'server/src/routers/feedbackAdmin.ts';
if (!fs.existsSync(file)) { console.error(`  [MISS] ${file}`); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');

if (s.includes('agentStatus: feedback.agentStatus')) {
  console.log('  [skip] agent fields already in list select');
} else {
  const anchor = '          updatedAt: feedback.updatedAt,';
  if (!s.includes(anchor)) {
    console.error('  [FAIL] list-select anchor NOT FOUND');
    process.exitCode = 1;
  } else {
    s = s.replace(anchor, anchor + `
          agentStatus: feedback.agentStatus,
          agentDiagnosis: feedback.agentDiagnosis,
          agentPrUrl: feedback.agentPrUrl,
          agentRunId: feedback.agentRunId,
          aiReviewStatus: feedback.aiReviewStatus,
          resolvedByType: feedback.resolvedByType,`);
    fs.writeFileSync(file, s);
    console.log('  [ok]   added agent fields to feedbackAdmin.list select');
  }
}
console.log('\nParity G1 patch complete.');
