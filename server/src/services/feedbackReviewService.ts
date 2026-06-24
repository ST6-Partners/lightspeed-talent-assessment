// ============================================================
// FEEDBACK REVIEW SERVICE — shared pre-submit AI "front desk" logic
// (Contract v1.0 §5). Extracted from the feedbackReview tRPC router so
// BOTH callers share one implementation, no duplication:
//   - server/src/routers/feedbackReview.ts  (in-app tRPC surface)
//   - server/src/http/feedbackApi.ts         (keyed HTTP API, Contract §4)
//
// Design: Vercel AI SDK v6 `generateObject` + zod → output is schema-
// validated BY CONSTRUCTION (no hand-rolled JSON parser). Corpus +
// duplicate retrieval runs server-side and is passed to the model.
//
// T1 of the template-first build (06-04-26). Tables: feedback,
// feedbackReviewAttempts, faq_entries, design_knowledge.
// ============================================================

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { feedbackReviewAttempts } from '../db/schema/feedback.js';
import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

// Current Sonnet (the deprecated claude-sonnet-4-20250514 retires 2026-06-15).
export const REVIEW_MODEL = 'claude-sonnet-4-6';

// ── Triage result schema (validated by construction) ─────────
export const triageResultSchema = z.object({
  outcome: z.enum(['ready_to_file', 'answer', 'duplicate', 'needs_info'])
    .describe('ready_to_file = new, valid item; answer = a known answer fully resolves it; '
      + 'duplicate = matches an existing item; needs_info = too vague to act on'),
  cleanedTitle: z.string().describe('A concise, clear title rewritten from the user input (<= 120 chars)'),
  aiDescription: z.string().describe('A cleaned-up restatement of the issue. Never discard the user meaning.'),
  priority: z.enum(['high', 'medium', 'low', 'unset']),
  priorityReasoning: z.string().describe('One sentence justifying the priority'),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'unset']).default('unset'),
  answer: z.string().nullable()
    .describe('If outcome=answer, the answer drawn ONLY from the provided knowledge base; otherwise null'),
  answerSource: z.string().nullable()
    .describe('If outcome=answer, the FAQ question or doc key the answer came from; otherwise null'),
  duplicateOfId: z.string().nullable()
    .describe('If outcome=duplicate, the id of the matched existing item from the candidates; otherwise null'),
  needsInfoPrompt: z.string().nullable()
    .describe('If outcome=needs_info, a short prompt telling the user what detail to add; otherwise null'),
  matches: z.array(z.object({
    id: z.string(),
    title: z.string(),
    why: z.string().describe('Why this existing item is related'),
  })).describe('Existing items related to the submission (may be empty)'),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

export interface ReviewInput {
  type: string;
  title: string;
  description?: string;
  severity?: string;
  priority?: string;
  screenPath?: string;
  contextSnapshot?: Record<string, any>;
}

export interface ReviewResult extends TriageResult {
  reviewAttemptId: string | null;   // null when the attempt was not persisted (no user)
  fallbackUsed: boolean;
}

// ── Server-side retrieval helpers ────────────────────────────
async function findDuplicateCandidates(db: any, _type: string, title: string, description: string) {
  const words = `${title} ${description ?? ''}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
  if (words.length === 0) return [];

  const orClauses = sql.join(
    words.map((w) => sql`(LOWER(title) LIKE ${'%' + w + '%'} OR LOWER(COALESCE(description, '')) LIKE ${'%' + w + '%'})`),
    sql` OR `,
  );

  const rows = await db.execute(sql`
    SELECT id, type, title, description, status, created_at
    FROM feedback
    WHERE status <> 'wont_fix'
      AND (${orClauses})
    ORDER BY created_at DESC
    LIMIT 8
  `);
  return rows.rows as Array<{ id: string; type: string; title: string; description: string | null; status: string }>;
}

async function findCorpusHits(db: any, title: string, description: string) {
  const words = `${title} ${description ?? ''}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  if (words.length === 0) return { faq: [], knowledge: [] };

  const faqOr = sql.join(
    words.map((w) => sql`(LOWER(question) LIKE ${'%' + w + '%'} OR LOWER(keywords) LIKE ${'%' + w + '%'})`),
    sql` OR `,
  );
  const kbOr = sql.join(
    words.map((w) => sql`(LOWER(key) LIKE ${'%' + w + '%'} OR LOWER(content) LIKE ${'%' + w + '%'})`),
    sql` OR `,
  );

  // Tolerate a missing/empty corpus — return no hits rather than throwing.
  try {
    const faqRes = await db.execute(sql`
      SELECT question, answer FROM faq_entries
      WHERE is_active = true AND (${faqOr})
      ORDER BY sort_order LIMIT 3
    `);
    const kbRes = await db.execute(sql`
      SELECT key, content FROM design_knowledge
      WHERE (${kbOr})
      LIMIT 3
    `);
    return {
      faq: faqRes.rows as Array<{ question: string; answer: string }>,
      knowledge: kbRes.rows as Array<{ key: string; content: string }>,
    };
  } catch (err: any) {
    console.warn('[feedbackReviewService] corpus lookup failed (is the corpus seeded?):', err?.message ?? err);
    return { faq: [], knowledge: [] };
  }
}

// ── The shared review function ───────────────────────────────
// Runs retrieval + the model, then (when userId is provided) persists a
// feedback_review_attempts row for deflection telemetry (Contract §5).
export async function runFeedbackReview(
  db: any,
  input: ReviewInput,
  opts: { userId?: string | null } = {},
): Promise<ReviewResult> {
  const startTime = Date.now();
  const description = input.description ?? '';

  // 1. Server-side retrieval (the "tool calls")
  const [candidates, corpus] = await Promise.all([
    findDuplicateCandidates(db, input.type, input.title, description),
    findCorpusHits(db, input.title, description),
  ]);

  const toolCalls = {
    duplicate_lookup: { count: candidates.length, ids: candidates.map((c) => c.id) },
    corpus_lookup: { faq: corpus.faq.length, knowledge: corpus.knowledge.length },
  };

  // 2. Run the model (generateObject — schema-validated output)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let result: TriageResult;
  let fallbackUsed = false;
  let tokensIn = 0;
  let tokensOut = 0;

  if (apiKey) {
    try {
      const anthropic = createAnthropic({ apiKey });
      const system = [
        'You are the AI front desk for an in-app feedback system.',
        'A user is about to file feedback. Your job is to triage it BEFORE it is saved:',
        '- If the KNOWLEDGE BASE already fully answers a question, set outcome="answer" and put the answer (drawn only from the provided knowledge) in `answer`.',
        '- If it clearly duplicates one of the EXISTING ITEMS, set outcome="duplicate" and put that item id in `duplicateOfId`.',
        '- If it is too vague to act on, set outcome="needs_info" and put a short prompt in `needsInfoPrompt`.',
        '- Otherwise set outcome="ready_to_file".',
        'Always clean up the title and description and suggest a priority. Never invent facts not present in the knowledge base.',
      ].join('\n');

      const prompt = [
        `FEEDBACK TYPE: ${input.type}`,
        `USER TITLE: ${input.title}`,
        `USER DESCRIPTION: ${description || '(none)'}`,
        input.screenPath ? `SCREEN: ${input.screenPath}` : '',
        '',
        'EXISTING ITEMS (possible duplicates):',
        candidates.length
          ? candidates.map((c) => `- [${c.id}] (${c.type}, ${c.status}) ${c.title}`).join('\n')
          : '(none found)',
        '',
        'KNOWLEDGE BASE — FAQ:',
        corpus.faq.length
          ? corpus.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
          : '(no relevant FAQ)',
        '',
        'KNOWLEDGE BASE — DOCS:',
        corpus.knowledge.length
          ? corpus.knowledge.map((k) => `[${k.key}] ${k.content.slice(0, 800)}`).join('\n\n')
          : '(no relevant docs)',
      ].filter(Boolean).join('\n');

      const gen = await generateObject({
        model: anthropic(REVIEW_MODEL),
        schema: triageResultSchema,
        system,
        prompt,
      });
      result = gen.object;
      tokensIn = (gen.usage as any)?.inputTokens ?? (gen.usage as any)?.promptTokens ?? 0;
      tokensOut = (gen.usage as any)?.outputTokens ?? (gen.usage as any)?.completionTokens ?? 0;
    } catch (err: any) {
      console.error('[feedbackReviewService] generateObject error:', err?.message ?? err);
      fallbackUsed = true;
      result = fallbackResult(input.title, description);
    }
  } else {
    // No API key (template demo / placeholder mode) — safe pass-through.
    fallbackUsed = true;
    result = fallbackResult(input.title, description);
  }

  const latencyMs = Date.now() - startTime;

  // 3. Persist the review attempt (deflection telemetry, Contract §5).
  //    Only when we have a user to attribute it to (userId is NOT NULL in the
  //    schema). HTTP callers without a user get a compute-only result.
  let reviewAttemptId: string | null = null;
  if (opts.userId) {
    const [attempt] = await db.insert(feedbackReviewAttempts).values({
      userId: opts.userId,
      feedbackType: input.type,
      screenPath: input.screenPath ?? null,
      rawInput: `${input.title}\n\n${description}`.trim(),
      contextSnapshot: input.contextSnapshot ?? null,
      aiReviewResult: result as any,
      toolCalls: toolCalls as any,
      model: apiKey && !fallbackUsed ? REVIEW_MODEL : null,
      tokensIn,
      tokensOut,
      latencyMs,
      fallbackUsed,
      outcome: result.outcome,
    }).returning();
    reviewAttemptId = attempt.id;
  }

  return { reviewAttemptId, fallbackUsed, ...result };
}

// ── Safe fallback when the model is unavailable ──────────────
export async function promoteResolutionToFaq(db: any, item: any, explicitAnswer?: string) {
  const parse = (x: any) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };
  let a = (explicitAnswer ?? '').trim();
  if (!a) { const d = item?.agentDiagnosis ?? parse(item?.adminNotes); if (d && typeof d === 'object') a = String(d.answer || d.recommended_fix || '').trim(); }
  if (!a && item?.aiReviewResult) { const r = parse(item.aiReviewResult); if (r && typeof r === 'object') a = String(r.answer || '').trim(); }
  if (!a && item?.adminNotes && !String(item.adminNotes).trim().startsWith('{')) a = String(item.adminNotes).trim();
  if (!a) return;
  const question = String(item?.aiTitle || item?.title || '').trim();
  if (!question) return;
  const keywords = question.toLowerCase().split(' ').filter((w) => w.length > 3).slice(0, 8).join(',');
  const category = String(item?.type || 'general');
  try {
    await db.execute(sql`INSERT INTO faq_entries (question, answer, keywords, category, sort_order, is_active) SELECT ${question}, ${a}, ${keywords}, ${category}, 100, true WHERE NOT EXISTS (SELECT 1 FROM faq_entries WHERE LOWER(question) = LOWER(${question}))`);
  } catch (err: any) { console.warn('[promoteResolutionToFaq] skipped:', err?.message ?? err); }
}

export function fallbackResult(title: string, description: string): TriageResult {
  return {
    outcome: 'ready_to_file',
    cleanedTitle: title.slice(0, 120),
    aiDescription: description || '',
    priority: 'unset',
    priorityReasoning: 'AI review unavailable — item passed through for manual triage.',
    severity: 'unset',
    answer: null,
    answerSource: null,
    duplicateOfId: null,
    needsInfoPrompt: null,
    matches: [],
  };
}
