// Parity G3 — answer_source in the review schema + multi-screenshot on submit.
// Self-verifying + idempotent. Run from repo root: node parity-g3-patch.mjs
import fs from 'fs';

function edit(file, name, marker, anchor, repl) {
  if (!fs.existsSync(file)) { console.error(`  [MISS] ${file}`); process.exitCode = 1; return; }
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(marker)) { console.log(`  [skip] ${name} (already applied)`); return; }
  if (!s.includes(anchor)) { console.error(`  [FAIL] ${name} — ANCHOR NOT FOUND`); process.exitCode = 1; return; }
  fs.writeFileSync(file, s.replace(anchor, repl));
  console.log(`  [ok]   ${name}`);
}

// 1. feedbackReviewService.ts — add answerSource to the triage schema
edit(
  'server/src/services/feedbackReviewService.ts',
  'answerSource (schema)',
  'answerSource',
  '  duplicateOfId: z.string().nullable()',
  "  answerSource: z.string().nullable()\n    .describe('If outcome=answer, the FAQ question or doc key the answer came from; otherwise null'),\n  duplicateOfId: z.string().nullable()",
);

// 2. feedbackReviewService.ts — answerSource in the safe fallback
edit(
  'server/src/services/feedbackReviewService.ts',
  'answerSource (fallback)',
  'answerSource: null',
  '    answer: null,',
  '    answer: null,\n    answerSource: null,',
);

// 3. feedbackAdmin.ts — accept screenshots[] on submit
edit(
  'server/src/routers/feedbackAdmin.ts',
  'submit accepts screenshots[]',
  'input.screenshots',
  '      screenshot: z.string().optional(),',
  '      screenshot: z.string().optional(),\n      screenshots: z.array(z.string()).optional(),',
);

// 4. feedbackAdmin.ts — store multiple attachments
edit(
  'server/src/routers/feedbackAdmin.ts',
  'store multiple screenshots',
  'Signal parity: up to 5',
  `      // Save screenshot attachment if provided
      if (input.screenshot) {
        await ctx.db.insert(feedbackAttachments).values({
          feedbackId: item.id,
          imageData: input.screenshot,
          mimeType: 'image/png',
          filename: 'auto-screenshot.png',
          sortOrder: 0,
        });
      }`,
  `      // Save screenshot attachments (Signal parity: up to 5)
      const shots = input.screenshots?.length ? input.screenshots : (input.screenshot ? [input.screenshot] : []);
      for (let i = 0; i < shots.length; i++) {
        await ctx.db.insert(feedbackAttachments).values({
          feedbackId: item.id,
          imageData: shots[i],
          mimeType: 'image/png',
          filename: \`screenshot-\${i + 1}.png\`,
          sortOrder: i,
        });
      }`,
);

console.log('\nParity G3 patch complete.');
