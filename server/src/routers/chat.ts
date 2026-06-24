// ============================================================
// CHAT ROUTER — AI-assisted chat with knowledge base, FAQ, prompt
// templates, screen context, and full telemetry integration
// Pattern: RCDO chat backend — session tracking, debug logging,
// knowledge retrieval, prompt assembly, reaction recording
// Tables: chatSessionLogs, chatDebugLog, promptTemplates,
//         designKnowledge, faqEntries, chatAttachments
// ============================================================

import { z } from 'zod';
import { eq, desc, and, sql, ilike, or } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { chatSessionLogs, chatDebugLog } from '../db/schema/telemetry.js';
import { promptTemplates, designKnowledge, faqEntries } from '../db/schema/ai.js';
import { users } from '../db/schema/core.js';
import { trackActivity } from '../services/telemetry.js';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

export const chatRouter = router({

  // ── Start a new conversation ────────────────────────────────
  // Creates a chatSessionLog entry and returns a conversation context
  startSession: protectedProcedure
    .input(z.object({
      screenMode: z.string().optional(),   // current page context
      screenTab: z.string().optional(),     // sub-tab context
      initialPrompt: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create session log
      const [session] = await ctx.db.insert(chatSessionLogs).values({
        userId: ctx.user.id,
        initialPrompt: input.initialPrompt,
        screenMode: input.screenMode || null,
        screenTab: input.screenTab || null,
      }).returning();

      // Track the event
      trackActivity(ctx.db, ctx.user.id, 'chat_start', input.screenMode || 'general', {
        sessionId: session.id,
      }).catch(() => {});

      return { sessionId: session.id };
    }),

  // ── Send a message and get AI response ──────────────────────
  // This is the main chat endpoint. It:
  // 1. Loads the active system prompt from prompt_templates
  // 2. Searches FAQ + knowledge base for relevant context
  // 3. Assembles the full prompt with screen context
  // 4. Returns a simulated AI response (adopters wire in real Claude API)
  // 5. Logs the debug entry for telemetry
  sendMessage: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      conversationId: z.string().uuid(),
      message: z.string().min(1),
      turnNumber: z.number().int().min(1),
      screenMode: z.string().optional(),
      screenTab: z.string().optional(),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const startTime = Date.now();

      // 1. Load active system prompt
      const systemPrompt = await ctx.db.query.promptTemplates.findFirst({
        where: and(
          eq(promptTemplates.key, 'chat.system'),
          eq(promptTemplates.isActive, true),
        ),
      });

      // 2. Search for relevant FAQ entries
      const userWords = input.message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      let relevantFaq: { question: string; answer: string }[] = [];
      if (userWords.length > 0) {
        const faqResults = await ctx.db.execute(sql`
          SELECT question, answer FROM faq_entries
          WHERE is_active = true
          AND (
            ${sql.join(
              userWords.slice(0, 5).map(word =>
                sql`(LOWER(question) LIKE ${'%' + word + '%'} OR LOWER(keywords) LIKE ${'%' + word + '%'})`
              ),
              sql` OR `
            )}
          )
          ORDER BY sort_order
          LIMIT 3
        `);
        relevantFaq = faqResults.rows as any[];
      }

      // 3. Search for relevant knowledge base entries
      let relevantKnowledge: { key: string; content: string }[] = [];
      if (userWords.length > 0) {
        const kbResults = await ctx.db.execute(sql`
          SELECT key, content FROM design_knowledge
          WHERE ${sql.join(
            userWords.slice(0, 5).map(word =>
              sql`(LOWER(key) LIKE ${'%' + word + '%'} OR LOWER(content) LIKE ${'%' + word + '%'})`
            ),
            sql` OR `
          )}
          LIMIT 3
        `);
        relevantKnowledge = kbResults.rows as any[];
      }

      // 4. Assemble prompt context
      const contextParts: string[] = [];

      if (systemPrompt) {
        contextParts.push(systemPrompt.content);
      } else {
        contextParts.push(
          'You are a helpful AI assistant for this application. ' +
          'Answer user questions based on your knowledge of the app. ' +
          'Be concise but thorough. If you don\'t know something, say so.'
        );
      }

      if (input.screenMode) {
        contextParts.push(`\nThe user is currently on the "${input.screenMode}" screen${input.screenTab ? ` (${input.screenTab} tab)` : ''}.`);
      }

      if (relevantFaq.length > 0) {
        contextParts.push('\nRelevant FAQ entries:');
        relevantFaq.forEach(f => {
          contextParts.push(`Q: ${f.question}\nA: ${f.answer}`);
        });
      }

      if (relevantKnowledge.length > 0) {
        contextParts.push('\nRelevant knowledge base:');
        relevantKnowledge.forEach(k => {
          contextParts.push(`[${k.key}]: ${k.content}`);
        });
      }

      // 5. Generate response via Claude API
      const assembledContext = contextParts.join('\n');

      let responseText: string;
      let inputTokens = 0;
      let outputTokens = 0;

      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (apiKey) {
        // Real Claude API call
        try {
          const anthropic = createAnthropic({ apiKey });

          // Build messages array from conversation history
          const messages: { role: 'user' | 'assistant'; content: string }[] = [];
          if (input.history && input.history.length > 0) {
            messages.push(...input.history);
          }
          messages.push({ role: 'user', content: input.message });

          const result = await generateText({
            model: anthropic('claude-sonnet-4-20250514'),
            system: assembledContext,
            messages,
            maxOutputTokens: 1024,
          });

          responseText = result.text;
          inputTokens = result.usage?.inputTokens ?? Math.ceil((assembledContext.length + input.message.length) / 4);
          outputTokens = result.usage?.outputTokens ?? Math.ceil(responseText.length / 4);
        } catch (err: any) {
          console.error('Claude API error:', err.message);
          // Fallback to canned response on API failure
          responseText = 'I apologize, but I\'m having trouble connecting to the AI service right now. ' +
            'Please try again in a moment, or check the FAQ section for quick answers.';
          inputTokens = 0;
          outputTokens = 0;
        }
      } else {
        // No API key — use canned responses (template demo mode)
        const lowerMsg = input.message.toLowerCase();
        const inputTokenEstimate = Math.ceil((assembledContext.length + input.message.length) / 4);

        if (relevantFaq.length > 0) {
          const faq = relevantFaq[0];
          responseText = `Based on our FAQ, here's what I found:\n\n**${faq.question}**\n\n${faq.answer}`;
          if (relevantFaq.length > 1) {
            responseText += `\n\nI also found ${relevantFaq.length - 1} more related FAQ entries. Would you like me to share those?`;
          }
        } else if (relevantKnowledge.length > 0) {
          const kb = relevantKnowledge[0];
          responseText = `From our knowledge base (${kb.key}):\n\n${kb.content.substring(0, 500)}`;
          if (kb.content.length > 500) responseText += '...';
        } else if (lowerMsg.includes('help') || lowerMsg.includes('what can you do')) {
          responseText = 'I can help you with several things:\n\n' +
            '1. **Answer questions** about this application and its features\n' +
            '2. **Search the FAQ** for common questions and answers\n' +
            '3. **Reference the knowledge base** for detailed documentation\n' +
            '4. **Provide screen-specific help** based on where you are in the app\n\n' +
            `You're currently on the ${input.screenMode || 'main'} screen. What would you like to know?`;
        } else if (input.screenMode) {
          responseText = `I can see you're on the **${input.screenMode}** screen` +
            (input.screenTab ? ` (${input.screenTab} tab)` : '') +
            `. Here's what I can help with on this screen:\n\n` +
            getScreenHelp(input.screenMode, input.screenTab) +
            `\n\nIs there something specific you'd like to know about?`;
        } else {
          responseText = generateGeneralResponse(input.message);
        }

        inputTokens = inputTokenEstimate;
        outputTokens = Math.ceil(responseText.length / 4);
      }

      const durationMs = Date.now() - startTime;

      // 6. Log the debug entry
      const [debugEntry] = await ctx.db.insert(chatDebugLog).values({
        userId: ctx.user.id,
        promptTemplateId: systemPrompt?.id || null,
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        turnNumber: input.turnNumber,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        toolCalls: relevantFaq.length + relevantKnowledge.length,  // Knowledge lookups as "tool calls"
        loopCount: 1,
        durationMs,
      }).returning();

      // 7. Track activity
      trackActivity(ctx.db, ctx.user.id, 'chat_message', input.screenMode || 'general', {
        sessionId: input.sessionId,
        turnNumber: input.turnNumber,
        faqHits: relevantFaq.length,
        kbHits: relevantKnowledge.length,
      }).catch(() => {});

      return {
        response: responseText,
        debugId: debugEntry.id,
        context: {
          faqHits: relevantFaq.length,
          kbHits: relevantKnowledge.length,
          hasSystemPrompt: !!systemPrompt,
          inputTokens,
          outputTokens,
          durationMs,
        },
      };
    }),

  // ── Record reaction on a response ──────────────────────────
  recordReaction: protectedProcedure
    .input(z.object({
      debugId: z.string().uuid(),
      reaction: z.enum(['thumbs_up', 'thumbs_down']),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.update(chatDebugLog)
        .set({ userReaction: input.reaction })
        .where(eq(chatDebugLog.id, input.debugId))
        .returning();

      trackActivity(ctx.db, ctx.user.id, 'chat_reaction', input.reaction, {
        debugId: input.debugId,
      }).catch(() => {});

      return row ? { success: true } : { success: false };
    }),

  // ── List user's recent conversations ───────────────────────
  myConversations: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: chatSessionLogs.id,
          initialPrompt: chatSessionLogs.initialPrompt,
          screenMode: chatSessionLogs.screenMode,
          screenTab: chatSessionLogs.screenTab,
          createdAt: chatSessionLogs.createdAt,
        })
        .from(chatSessionLogs)
        .where(eq(chatSessionLogs.userId, ctx.user.id))
        .orderBy(desc(chatSessionLogs.createdAt))
        .limit(input?.limit ?? 20);

      return rows;
    }),

  // ── Get conversation turn count and last activity ──────────
  conversationStats: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.execute(sql`
        SELECT
          COUNT(*) as turn_count,
          MAX(created_at) as last_activity,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          COUNT(*) FILTER (WHERE user_reaction = 'thumbs_up') as thumbs_up,
          COUNT(*) FILTER (WHERE user_reaction = 'thumbs_down') as thumbs_down
        FROM chat_debug_log
        WHERE session_id = ${input.sessionId}
      `);
      return result.rows[0] || { turn_count: 0, last_activity: null, total_input_tokens: 0, total_output_tokens: 0, thumbs_up: 0, thumbs_down: 0 };
    }),
});

// ── Screen-specific help text ─────────────────────────────────
function getScreenHelp(screen: string, tab?: string | null): string {
  const SCREEN_HELP: Record<string, string> = {
    home: 'The home screen shows your dashboard overview with key metrics and recent activity.',
    entities: 'The entities screen lets you view, create, edit, and manage your data records. You can filter, sort, and archive items.',
    settings: 'The settings area contains admin panels organized by permission tier: User, Analytics, Config, and System.',
    admin: 'Admin panels provide tools for managing users, reviewing telemetry, handling feedback, and configuring the system.',
    chat: 'The chat interface connects you with an AI assistant that has access to your app\'s knowledge base and FAQ.',
  };

  const TAB_HELP: Record<string, string> = {
    gettingstarted: 'Getting Started provides onboarding videos and a step-by-step guide for new users.',
    telemetry: 'Telemetry shows user activity metrics: Pulse (daily actives), Overview (participation), Trends (weekly), Activity Log, and Chat Debug.',
    feedback: 'Feedback triage lets admins review, prioritize, and resolve user-submitted feedback items.',
    chatlogs: 'Chat Logs shows initial prompts from each chat session with screen context.',
    satisfaction: 'Satisfaction tracks both explicit reactions (thumbs up/down) and passive sentiment signals from chat messages.',
    users: 'User Management handles the four-tier role model, account creation, password resets, and active/beta toggles.',
    prompts: 'Prompt Management lets sysadmins version and edit AI prompt templates used by the chat system.',
  };

  let help = SCREEN_HELP[screen.toLowerCase()] || `This is the ${screen} screen.`;
  if (tab && TAB_HELP[tab.toLowerCase()]) {
    help += '\n\n' + TAB_HELP[tab.toLowerCase()];
  }
  return help;
}

// ── General response for unmatched queries ────────────────────
function generateGeneralResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('entity') || lower.includes('entities') || lower.includes('record')) {
    return 'Entities are the core data objects in this application. You can create, edit, archive, and restore them from the Entities page. ' +
      'Each entity has a name, type, status, owner, and optional description. Archived entities can be recovered from the Admin > Archived Items panel.';
  }

  if (lower.includes('feedback') || lower.includes('bug') || lower.includes('report')) {
    return 'You can submit feedback using the message icon in the top bar. Feedback types include bugs, feature requests, and general feedback. ' +
      'Admins can triage feedback from the Settings > Feedback panel, and you\'ll receive a notification when your feedback status changes.';
  }

  if (lower.includes('user') || lower.includes('role') || lower.includes('permission')) {
    return 'This app uses a four-tier role model: User, Manager, Admin, and Sysadmin. Each tier unlocks additional admin panels. ' +
      'Admins manage users from Settings > Users, including role assignment, password resets, and active/beta status toggles.';
  }

  if (lower.includes('telemetry') || lower.includes('analytics') || lower.includes('metric')) {
    return 'The Telemetry dashboard tracks user activity across five views: Pulse (daily active users), Overview (participation rate and top users), ' +
      'Trends (weekly rolling metrics), Activity Log (raw events), and Chat Debug (AI interaction metrics). All user actions automatically generate telemetry data.';
  }

  if (lower.includes('release') || lower.includes('version') || lower.includes("what's new")) {
    return 'Release notes are managed from Settings > Releases. Admins can create draft releases, then publish them to notify all users. ' +
      'Published releases appear via the sparkles icon in the top bar.';
  }

  if (lower.includes('backup') || lower.includes('restore') || lower.includes('export')) {
    return 'The system supports full database backups with retention policies, snapshot export/sync for deployment, and database export. ' +
      'Backups can be created and restored from Settings > Backups. Before any restore, a safety backup is automatically created.';
  }

  return 'I\'m here to help you navigate and use this application effectively. I can answer questions about features, ' +
    'guide you through workflows, and provide information from our FAQ and knowledge base. What would you like to know about?';
}
