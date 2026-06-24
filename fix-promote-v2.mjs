import fs from 'fs';
function patch(file, name, marker, anchor, repl) {
  if (!fs.existsSync(file)) { console.error('  [MISS] ' + file); process.exitCode = 1; return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(marker)) { console.log('  [skip] ' + name); return; }
  if (!s.includes(anchor)) { console.error('  [FAIL] ' + name + ' ANCHOR NOT FOUND'); process.exitCode = 1; return; }
  fs.writeFileSync(file, s.replace(anchor, repl));
  console.log('  [ok]   ' + name);
}
const HELPER = [
  "export async function promoteResolutionToFaq(db, item, explicitAnswer) {",
  "  const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };",
  "  let a = (explicitAnswer ?? '').trim();",
  "  if (!a) { const d = item?.agentDiagnosis ?? parse(item?.adminNotes); if (d && typeof d === 'object') a = String(d.answer || d.recommended_fix || '').trim(); }",
  "  if (!a && item?.aiReviewResult) { const r = parse(item.aiReviewResult); if (r && typeof r === 'object') a = String(r.answer || '').trim(); }",
  "  if (!a && item?.adminNotes && !String(item.adminNotes).trim().startsWith('{')) a = String(item.adminNotes).trim();",
  "  if (!a) return;",
  "  const question = String(item?.aiTitle || item?.title || '').trim();",
  "  if (!question) return;",
  "  const keywords = question.toLowerCase().split(' ').filter((w) => w.length > 3).slice(0, 8).join(',');",
  "  const category = String(item?.type || 'general');",
  "  try {",
  "    await db.execute(sql`INSERT INTO faq_entries (question, answer, keywords, category, sort_order, is_active) SELECT ${question}, ${a}, ${keywords}, ${category}, 100, true WHERE NOT EXISTS (SELECT 1 FROM faq_entries WHERE LOWER(question) = LOWER(${question}))`);",
  "  } catch (err) { console.warn('[promoteResolutionToFaq] skipped:', err?.message ?? err); }",
  "}",
  "",
  "",
].join('\n');
patch('server/src/services/feedbackReviewService.ts', 'promote helper',
  'export async function promoteResolutionToFaq',
  'export function fallbackResult(',
  HELPER + 'export function fallbackResult(');
patch('server/src/routers/feedbackAdmin.ts', 'promote on resolve (trpc)',
  'promoteResolutionToFaq(ctx.db',
  '      // Notify the original submitter when status changes',
  "      if (input.status === 'resolved') {\n        await promoteResolutionToFaq(ctx.db, existing, input.resolutionNotes);\n      }\n      // Notify the original submitter when status changes");
patch('server/src/http/feedbackApi.ts', 'promote on resolve (http)',
  'promoteResolutionToFaq(db',
  '  // Notify the submitter (feedback_response) + admins (agent_resolution).',
  "  await promoteResolutionToFaq(db, existing, resolution_notes);\n\n  // Notify the submitter (feedback_response) + admins (agent_resolution).");
patch('server/src/routers/feedbackAdmin.ts', 'import promote (trpc)',
  "import { promoteResolutionToFaq }",
  "import { trackActivity } from '../services/telemetry.js';",
  "import { trackActivity } from '../services/telemetry.js';\nimport { promoteResolutionToFaq } from '../services/feedbackReviewService.js';");
patch('server/src/http/feedbackApi.ts', 'import promote (http)',
  "promoteResolutionToFaq } from",
  "import { runFeedbackReview } from '../services/feedbackReviewService.js';",
  "import { runFeedbackReview, promoteResolutionToFaq } from '../services/feedbackReviewService.js';");
console.log('\nPromote v2 complete.');
