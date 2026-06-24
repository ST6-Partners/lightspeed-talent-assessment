// ============================================================
// TELEMETRY ROUTER — activity dashboard + debug session queries
// Pattern: RCDO AdminTelemetryDashboard with generalized metrics
// Tables: userActivityLog, chatDebugLog, users
// ============================================================

import { z } from 'zod';
import { eq, desc, and, count, sql, gte, isNotNull } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { userActivityLog, chatDebugLog, chatSessionLogs } from '../db/schema/telemetry.js';
import { users } from '../db/schema/core.js';
import { requireAdmin } from '../services/permissions.js';

export const telemetryRouter = router({

  // ── Raw activity log (existing) ─────────────────────────────
  activityLog: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
      eventType: z.string().optional(),
      userId: z.string().uuid().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const filters = [];
      if (input?.eventType) filters.push(eq(userActivityLog.eventType, input.eventType));
      if (input?.userId) filters.push(eq(userActivityLog.userId, input.userId));

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const rows = await ctx.db
        .select({
          id: userActivityLog.id,
          userId: userActivityLog.userId,
          userName: users.name,
          eventType: userActivityLog.eventType,
          eventValue: userActivityLog.eventValue,
          metadata: userActivityLog.metadata,
          createdAt: userActivityLog.createdAt,
        })
        .from(userActivityLog)
        .leftJoin(users, eq(userActivityLog.userId, users.id))
        .where(whereClause)
        .orderBy(desc(userActivityLog.createdAt))
        .limit(limit)
        .offset(offset);

      const totalResult = await ctx.db
        .select({ count: count() })
        .from(userActivityLog)
        .where(whereClause);
      const total = totalResult[0].count;

      return { rows, total };
    }),

  activityStats: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      return ctx.db
        .select({
          eventType: userActivityLog.eventType,
          count: count(),
        })
        .from(userActivityLog)
        .groupBy(userActivityLog.eventType);
    }),

  // ── Pulse — daily activity (RCDO pattern) ───────────────────
  // Returns daily active-user counts + event counts for a time window
  pulse: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      weeks: z.number().int().min(1).max(12).default(4),
    }).optional())
    .query(async ({ ctx, input }) => {
      const weeks = input?.weeks ?? 4;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      // Daily active users + event counts
      const dailyActivity = await ctx.db.execute(sql`
        SELECT
          DATE(created_at) as day,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
          COUNT(*) FILTER (WHERE event_type NOT IN ('page_view')) as actions
        FROM user_activity_log
        WHERE created_at >= ${startDate.toISOString()}
        GROUP BY DATE(created_at)
        ORDER BY day
      `);

      // Summary KPIs — computed from dailyActivity rows to avoid CROSS JOIN issues
      const days = dailyActivity.rows as any[];
      const uniqueUsersResult = await ctx.db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_events
        FROM user_activity_log
        WHERE created_at >= ${startDate.toISOString()}
      `);
      const totals = uniqueUsersResult.rows[0] as any;
      const dailyUserCounts = days.map(d => Number(d.active_users) || 0);
      const summary = {
        rows: [{
          unique_users: Number(totals?.unique_users) || 0,
          total_events: Number(totals?.total_events) || 0,
          active_days: days.length,
          avg_daily_users: dailyUserCounts.length > 0
            ? Math.round((dailyUserCounts.reduce((a: number, b: number) => a + b, 0) / dailyUserCounts.length) * 10) / 10
            : 0,
          peak_daily_users: dailyUserCounts.length > 0
            ? Math.max(...dailyUserCounts)
            : 0,
        }],
      };

      return {
        days: dailyActivity.rows as Array<{
          day: string;
          active_users: number;
          total_events: number;
          page_views: number;
          actions: number;
        }>,
        summary: summary.rows[0] as {
          unique_users: number;
          total_events: number;
          active_days: number;
          avg_daily_users: number;
          peak_daily_users: number;
        },
      };
    }),

  // ── Overview — user activity summary (RCDO pattern) ─────────
  // Top users, participation rate, event distribution
  overview: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      weeks: z.number().int().min(1).max(12).default(4),
    }).optional())
    .query(async ({ ctx, input }) => {
      const weeks = input?.weeks ?? 4;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      // Total registered active users
      const totalUsersResult = await ctx.db.execute(sql`
        SELECT COUNT(*) as total FROM users WHERE is_active = true
      `);
      const totalUsers = parseInt((totalUsersResult.rows[0] as any).total);

      // Active users in window
      const activeUsersResult = await ctx.db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as active
        FROM user_activity_log
        WHERE created_at >= ${startDate.toISOString()}
      `);
      const activeUsers = parseInt((activeUsersResult.rows[0] as any).active);

      // Participation rate
      const participationRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

      // Top 10 active users
      const topUsers = await ctx.db.execute(sql`
        SELECT
          u.id, u.name, u.email, u.role,
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE a.event_type = 'page_view') as page_views,
          COUNT(*) FILTER (WHERE a.event_type != 'page_view') as actions,
          MAX(a.created_at) as last_active
        FROM user_activity_log a
        JOIN users u ON a.user_id = u.id
        WHERE a.created_at >= ${startDate.toISOString()}
        GROUP BY u.id, u.name, u.email, u.role
        ORDER BY total_events DESC
        LIMIT 10
      `);

      // Event type breakdown
      const eventBreakdown = await ctx.db.execute(sql`
        SELECT event_type, COUNT(*) as count
        FROM user_activity_log
        WHERE created_at >= ${startDate.toISOString()}
        GROUP BY event_type
        ORDER BY count DESC
      `);

      return {
        totalUsers,
        activeUsers,
        participationRate,
        topUsers: topUsers.rows as Array<{
          id: string;
          name: string;
          email: string;
          role: string;
          total_events: number;
          page_views: number;
          actions: number;
          last_active: string;
        }>,
        eventBreakdown: eventBreakdown.rows as Array<{
          event_type: string;
          count: number;
        }>,
      };
    }),

  // ── Trends — weekly rolling metrics (RCDO pattern) ──────────
  // Weekly active users, participation, and event volume over N weeks
  trends: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      weeks: z.number().int().min(4).max(24).default(12),
    }).optional())
    .query(async ({ ctx, input }) => {
      const weeks = input?.weeks ?? 12;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      // Total active users for participation calculation
      const totalUsersResult = await ctx.db.execute(sql`
        SELECT COUNT(*) as total FROM users WHERE is_active = true
      `);
      const totalUsers = parseInt((totalUsersResult.rows[0] as any).total);

      // Weekly aggregates
      const weeklyData = await ctx.db.execute(sql`
        SELECT
          DATE_TRUNC('week', created_at)::date as week_start,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
          COUNT(*) FILTER (WHERE event_type != 'page_view') as actions
        FROM user_activity_log
        WHERE created_at >= ${startDate.toISOString()}
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week_start
      `);

      const weeksData = (weeklyData.rows as any[]).map(w => ({
        week_start: w.week_start,
        active_users: parseInt(w.active_users),
        total_events: parseInt(w.total_events),
        page_views: parseInt(w.page_views),
        actions: parseInt(w.actions),
        participation_pct: totalUsers > 0
          ? Math.round((parseInt(w.active_users) / totalUsers) * 100)
          : 0,
      }));

      return { totalUsers, weeks: weeksData };
    }),

  // ── Debug sessions (existing, unchanged) ────────────────────
  debugSessions: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: chatDebugLog.id,
          userId: chatDebugLog.userId,
          userName: users.name,
          promptTemplateId: chatDebugLog.promptTemplateId,
          sessionId: chatDebugLog.sessionId,
          inputTokens: chatDebugLog.inputTokens,
          outputTokens: chatDebugLog.outputTokens,
          toolCalls: chatDebugLog.toolCalls,
          loopCount: chatDebugLog.loopCount,
          durationMs: chatDebugLog.durationMs,
          createdAt: chatDebugLog.createdAt,
        })
        .from(chatDebugLog)
        .leftJoin(users, eq(chatDebugLog.userId, users.id))
        .orderBy(desc(chatDebugLog.createdAt))
        .limit(input?.limit ?? 20);

      return { rows };
    }),

  debugStats: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const result = await ctx.db
        .select({
          totalSessions: count(),
          avgDuration: sql<number>`avg(cast(${chatDebugLog.durationMs} as float))`,
          totalInputTokens: sql<number>`sum(${chatDebugLog.inputTokens})`,
          totalOutputTokens: sql<number>`sum(${chatDebugLog.outputTokens})`,
        })
        .from(chatDebugLog);

      return result[0] || {
        totalSessions: 0,
        avgDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      };
    }),

  // ── Write: log a chat debug entry (called by AI/chat service) ──
  logChatDebug: protectedProcedure
    .input(z.object({
      promptTemplateId: z.string().uuid().optional(),
      sessionId: z.string().optional(),
      conversationId: z.string().uuid().optional(),
      turnNumber: z.number().int().optional(),
      inputTokens: z.number().int().optional(),
      outputTokens: z.number().int().optional(),
      toolCalls: z.number().int().optional(),
      loopCount: z.number().int().optional(),
      durationMs: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(chatDebugLog).values({
        userId: ctx.user.id,
        promptTemplateId: input.promptTemplateId || null,
        sessionId: input.sessionId || null,
        conversationId: input.conversationId || null,
        turnNumber: input.turnNumber || null,
        inputTokens: input.inputTokens || null,
        outputTokens: input.outputTokens || null,
        toolCalls: input.toolCalls || null,
        loopCount: input.loopCount || null,
        durationMs: input.durationMs || null,
      }).returning();
      return row;
    }),

  // ── Write: log a chat session start (called when user starts a chat) ──
  logChatSession: protectedProcedure
    .input(z.object({
      initialPrompt: z.string().min(1),
      screenMode: z.string().optional(),
      screenTab: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(chatSessionLogs).values({
        userId: ctx.user.id,
        initialPrompt: input.initialPrompt,
        screenMode: input.screenMode || null,
        screenTab: input.screenTab || null,
      }).returning();
      return row;
    }),

  // ── Write: record a user reaction on a chat response ──────
  recordReaction: protectedProcedure
    .input(z.object({
      chatDebugLogId: z.string().uuid(),
      reaction: z.enum(['thumbs_up', 'thumbs_down']),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.update(chatDebugLog)
        .set({ userReaction: input.reaction })
        .where(eq(chatDebugLog.id, input.chatDebugLogId))
        .returning();
      if (!row) return null;
      return row;
    }),

  // ── Chat session logs (RCDO pattern) ────────────────────────
  // Stores initial prompts per chat session with screen context
  chatLogs: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
      screenMode: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const filters = [];
      if (input?.screenMode) filters.push(eq(chatSessionLogs.screenMode, input.screenMode));
      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const rows = await ctx.db
        .select({
          id: chatSessionLogs.id,
          userId: chatSessionLogs.userId,
          userName: users.name,
          initialPrompt: chatSessionLogs.initialPrompt,
          screenMode: chatSessionLogs.screenMode,
          screenTab: chatSessionLogs.screenTab,
          createdAt: chatSessionLogs.createdAt,
        })
        .from(chatSessionLogs)
        .leftJoin(users, eq(chatSessionLogs.userId, users.id))
        .where(whereClause)
        .orderBy(desc(chatSessionLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const totalResult = await ctx.db
        .select({ count: count() })
        .from(chatSessionLogs)
        .where(whereClause);
      const total = totalResult[0].count;

      // Get distinct screen modes for filter
      const modes = await ctx.db
        .select({ mode: chatSessionLogs.screenMode })
        .from(chatSessionLogs)
        .where(isNotNull(chatSessionLogs.screenMode))
        .groupBy(chatSessionLogs.screenMode);

      return { rows, total, modes: modes.map(m => m.mode).filter(Boolean) as string[] };
    }),

  // ── Satisfaction — reaction stats (RCDO pattern) ────────────
  // Aggregates explicit user reactions (thumbs_up/thumbs_down) from chat_debug_log
  satisfaction: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
    }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Overall reaction counts
      const reactionCounts = await ctx.db.execute(sql`
        SELECT
          user_reaction,
          COUNT(*) as count
        FROM chat_debug_log
        WHERE user_reaction IS NOT NULL
          AND created_at >= ${startDate.toISOString()}
        GROUP BY user_reaction
      `);

      // Reactions by screen (via session matching with chat_session_logs)
      const reactionsByScreen = await ctx.db.execute(sql`
        SELECT
          COALESCE(csl.screen_mode, 'unknown') as screen_mode,
          cdl.user_reaction,
          COUNT(*) as count
        FROM chat_debug_log cdl
        LEFT JOIN chat_session_logs csl ON cdl.session_id = csl.id::text
        WHERE cdl.user_reaction IS NOT NULL
          AND cdl.created_at >= ${startDate.toISOString()}
        GROUP BY csl.screen_mode, cdl.user_reaction
        ORDER BY count DESC
      `);

      // Reactions by user (top 10)
      const reactionsByUser = await ctx.db.execute(sql`
        SELECT
          u.id, u.name, u.email,
          COUNT(*) FILTER (WHERE cdl.user_reaction = 'thumbs_up') as thumbs_up,
          COUNT(*) FILTER (WHERE cdl.user_reaction = 'thumbs_down') as thumbs_down,
          COUNT(*) as total_reactions
        FROM chat_debug_log cdl
        JOIN users u ON cdl.user_id = u.id
        WHERE cdl.user_reaction IS NOT NULL
          AND cdl.created_at >= ${startDate.toISOString()}
        GROUP BY u.id, u.name, u.email
        ORDER BY total_reactions DESC
        LIMIT 10
      `);

      // Daily trend
      const dailyReactions = await ctx.db.execute(sql`
        SELECT
          DATE(created_at) as day,
          COUNT(*) FILTER (WHERE user_reaction = 'thumbs_up') as thumbs_up,
          COUNT(*) FILTER (WHERE user_reaction = 'thumbs_down') as thumbs_down
        FROM chat_debug_log
        WHERE user_reaction IS NOT NULL
          AND created_at >= ${startDate.toISOString()}
        GROUP BY DATE(created_at)
        ORDER BY day
      `);

      const reactions = reactionCounts.rows as any[];
      const thumbsUp = reactions.find(r => r.user_reaction === 'thumbs_up');
      const thumbsDown = reactions.find(r => r.user_reaction === 'thumbs_down');
      const totalReactions = reactions.reduce((sum: number, r: any) => sum + parseInt(r.count), 0);
      const satisfactionRate = totalReactions > 0
        ? Math.round((parseInt(thumbsUp?.count || '0') / totalReactions) * 100)
        : 0;

      return {
        summary: {
          thumbsUp: parseInt(thumbsUp?.count || '0'),
          thumbsDown: parseInt(thumbsDown?.count || '0'),
          totalReactions,
          satisfactionRate,
        },
        byScreen: reactionsByScreen.rows as Array<{
          screen_mode: string; user_reaction: string; count: number;
        }>,
        byUser: reactionsByUser.rows as Array<{
          id: string; name: string; email: string;
          thumbs_up: number; thumbs_down: number; total_reactions: number;
        }>,
        daily: dailyReactions.rows as Array<{
          day: string; thumbs_up: number; thumbs_down: number;
        }>,
      };
    }),

  // ── Sentiment mining (RCDO pattern) ─────────────────────────
  // Regex-based passive analysis: gratitude, confirmation, praise, success signals
  sentiment: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
    }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Pull recent chat session logs for sentiment analysis
      const logs = await ctx.db.execute(sql`
        SELECT
          csl.id,
          csl.initial_prompt,
          csl.screen_mode,
          csl.created_at,
          u.name as user_name
        FROM chat_session_logs csl
        LEFT JOIN users u ON csl.user_id = u.id
        WHERE csl.created_at >= ${startDate.toISOString()}
        ORDER BY csl.created_at DESC
        LIMIT 500
      `);

      // Sentiment signal patterns (RCDO pattern)
      const SIGNALS = {
        gratitude: {
          label: 'Gratitude',
          weight: 1.0,
          patterns: [
            /\bthank(?:s| you)\b/i,
            /\bappreciate\b/i,
            /\bgrateful\b/i,
            /\bhelpful\b/i,
          ],
        },
        confirmation: {
          label: 'Confirmation',
          weight: 1.2,
          patterns: [
            /\bthat(?:'s| is) (?:exactly |just )?(?:what|right|correct|perfect)\b/i,
            /\byes[,!. ]/i,
            /\bexactly\b/i,
            /\bspot on\b/i,
          ],
        },
        praise: {
          label: 'Praise',
          weight: 1.5,
          patterns: [
            /\b(?:great|excellent|awesome|amazing|fantastic|wonderful|brilliant)\b/i,
            /\bwell done\b/i,
            /\bnice (?:work|job)\b/i,
            /\bimpressive\b/i,
          ],
        },
        success: {
          label: 'Success',
          weight: 1.3,
          patterns: [
            /\bthat (?:worked|fixed|solved)\b/i,
            /\bproblem solved\b/i,
            /\ball (?:good|set|done)\b/i,
            /\bworks? (?:great|perfectly|now)\b/i,
          ],
        },
      };

      const rows = logs.rows as any[];
      let totalScore = 0;
      const signalCounts: Record<string, number> = {
        gratitude: 0, confirmation: 0, praise: 0, success: 0,
      };
      const samples: Array<{
        id: string; text: string; signal: string; userName: string;
        screenMode: string; createdAt: string;
      }> = [];

      for (const row of rows) {
        const text = row.initial_prompt || '';
        for (const [key, signal] of Object.entries(SIGNALS)) {
          for (const pattern of signal.patterns) {
            if (pattern.test(text)) {
              signalCounts[key]++;
              totalScore += signal.weight;
              // Keep up to 5 samples per signal type
              if (samples.filter(s => s.signal === key).length < 5) {
                samples.push({
                  id: row.id,
                  text: text.length > 200 ? text.substring(0, 200) + '...' : text,
                  signal: key,
                  userName: row.user_name || 'Unknown',
                  screenMode: row.screen_mode || 'unknown',
                  createdAt: row.created_at,
                });
              }
              break; // Only count once per signal type per message
            }
          }
        }
      }

      const messagesAnalyzed = rows.length;
      const avgScore = messagesAnalyzed > 0
        ? Math.round((totalScore / messagesAnalyzed) * 100) / 100
        : 0;
      const positiveRate = messagesAnalyzed > 0
        ? Math.round(((signalCounts.gratitude + signalCounts.praise + signalCounts.success) / messagesAnalyzed) * 100)
        : 0;

      return {
        summary: {
          messagesAnalyzed,
          totalScore: Math.round(totalScore * 10) / 10,
          avgScore,
          positiveRate,
        },
        signals: Object.entries(SIGNALS).map(([key, signal]) => ({
          key,
          label: signal.label,
          weight: signal.weight,
          count: signalCounts[key],
        })),
        samples,
      };
    }),
});
