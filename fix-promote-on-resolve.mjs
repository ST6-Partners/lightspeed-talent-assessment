import fs from 'fs';
function patch(file, edits) {
  if (!fs.existsSync(file)) { console.error('  [MISS] ' + file); process.exitCode = 1; return; }
  let s = fs.readFileSync(file, 'utf8'); let changed = false;
  for (const [name, marker, anchor, repl] of edits) {
    if (s.includes(marker)) { console.log('  [skip] ' + name); continue; }
    if (!s.includes(anchor)) { console.error('  [FAIL] ' + name + ' ANCHOR NOT FOUND'); process.exitCode = 1; continue; }
    s = s.replace(anchor, repl); changed = true; console.log('  [ok]   ' + name);
  }
  if (changed) fs.writeFileSync(file, s);
}
patch('server/src/services/feedbackReviewService.ts', [[
  'promoteResolutionToFaq helper', 'export async function promoteResolutionToFaq',
  "    answer: null,\n    duplicateOfId: null,\n    needsInfoPrompt: null,\n    matches: [],\n  };\n}",
  "    answer: null,\n    duplicateOfId: null,\n    needsInfoPrompt: null,\n    matches: [],\n  };\n}\n\nexport async function promoteResolutionToFaq(db, item, explicitAnswer) {\n  const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };\n  let a = (explicitAnswer ?? '').trim();\n  if (!a) { const d = item?.agentDiagnosis ?? parse(item?.adminNotes); if (d && typeof d === 'object') a = String(d.answer || d.recommended_fix || '').trim(); }\n  if (!a && item?.aiReviewResult) { const r = parse(item.aiReviewResult); if (r && typeof r === 'object') a = String(r.answer || '').trim(); }\n  if (!a && item?.adminNotes && !String(item.adminNotes).trim().startsWith('{')) a = String(item.adminNotes).trim();\n  if (!a) return;\n  const question = String(item?.aiTitle || item?.title || '').trim();\n  if (!question) return;\n  const keywords = question.toLowerCase().split(' ').filter((w) => w.length > 3).slice(0, 8).join(',');\n  const category = String(item?.type || 'general');\n  try {\n    await db.execute(sql`\n      INSERT INTO faq_entries (question, answer, keywords, category, sort_order, is_active)\n      SELECT ${question}, ${a}, ${keywords}, ${category}, 100, true\n      WHERE NOT EXISTS (SELECT 1 FROM faq_entries WHERE LOWER(question) = LOWER(${question}))\n    `);\n  } catch (err) { console.warn('[promoteResolutionToFaq] skipped:', err?.message ?? err); }\n}",
]]);
patch('server/src/routers/feedbackAdmin.ts', [
  ['import promote (trpc)', "import { promoteResolutionToFaq }",
    "import { trackActivity } from '../services/telemetry.js';",
    "import { trackActivity } from '../services/telemetry.js';\nimport { promoteResolutionToFaq } from '../services/feedbackReviewService.js';"],
  ['promote on resolve (trpc)', 'promoteResolutionToFaq(ctx.db',
    "        .where(eq(feedback.id, input.id))\n        .returning();\n      // Notify the original submitter when status changes",
    "        .where(eq(feedback.id, input.id))\n        .returning();\n      if (input.status === 'resolved') {\n        await promoteResolutionToFaq(ctx.db, existing, input.resolutionNotes);\n      }\n      // Notify the original submitter when status changes"],
]);
patch('server/src/http/feedbackApi.ts', [
  ['import promote (http)', "promoteResolutionToFaq } from",
    "import { runFeedbackReview } from '../services/feedbackReviewService.js';",
    "import { runFeedbackReview, promoteResolutionToFaq } from '../services/feedbackReviewService.js';"],
  ['promote on resolve (http)', 'promoteResolutionToFaq(db',
    "  }).where(eq(feedback.id, req.params.id)).returning();\n\n  // Notify the submitter (feedback_response) + admins (agent_resolution).",
    "  }).where(eq(feedback.id, req.params.id)).returning();\n\n  await promoteResolutionToFaq(db, existing, resolution_notes);\n\n  // Notify the submitter (feedback_response) + admins (agent_resolution)."],
]);
console.log('\nPromote-on-resolve (automatic) patch complete.');
