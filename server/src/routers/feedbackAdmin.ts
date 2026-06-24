// ============================================================
// FEEDBACK ADMIN ROUTER — admin feedback management
// Tables: feedback, users, notifications
// ============================================================

import { z } from 'zod';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { feedback, feedbackAttachments } from '../db/schema/feedback.js';
import { users, screenInventory } from '../db/schema/core.js';
import { notifications } from '../db/schema/notifications.js';
import { requireAdmin } from '../services/permissions.js';
import { trackActivity } from '../services/telemetry.js';
import { promoteResolutionToFaq } from '../services/feedbackReviewService.js';

export const feedbackAdminRouter = router({
  list: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
      type: z.string().optional(),
      status: z.string().optional(),
      severity: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, limit, type, status, severity } = input;
      const offset = (page - 1) * limit;

      // Build filters
      const filters = [];
      if (type) filters.push(eq(feedback.type, type));
      if (status) filters.push(eq(feedback.status, status));
      if (severity) filters.push(eq(feedback.severity, severity));

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      // Fetch rows with user join
      const rows = await ctx.db
        .select({
          id: feedback.id,
          userId: feedback.userId,
          submitterName: users.name,
          type: feedback.type,
          title: feedback.title,
          description: feedback.description,
          severity: feedback.severity,
          affectedScope: feedback.affectedScope,
          screenPath: feedback.screenPath,
          status: feedback.status,
          adminNotes: feedback.adminNotes,
          resolvedBy: feedback.resolvedBy,
          resolvedAt: feedback.resolvedAt,
          createdAt: feedback.createdAt,
          updatedAt: feedback.updatedAt,
          agentStatus: feedback.agentStatus,
          agentDiagnosis: feedback.agentDiagnosis,
          agentPrUrl: feedback.agentPrUrl,
          agentRunId: feedback.agentRunId,
          aiReviewStatus: feedback.aiReviewStatus,
          resolvedByType: feedback.resolvedByType,
        })
        .from(feedback)
        .leftJoin(users, eq(feedback.userId, users.id))
        .where(whereClause)
        .orderBy(desc(feedback.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const totalResult = await ctx.db
        .select({ count: count() })
        .from(feedback)
        .where(whereClause);
      const total = totalResult[0].count;

      // Get counts by status
      const statusCountsResult = await ctx.db
        .select({
          status: feedback.status,
          count: count(),
        })
        .from(feedback)
        .groupBy(feedback.status);

      const counts = {
        open: 0,
        in_progress: 0,
        resolved: 0,
        wont_fix: 0,
      };

      statusCountsResult.forEach((item) => {
        if (item.status === 'open') counts.open = item.count;
        else if (item.status === 'in_progress') counts.in_progress = item.count;
        else if (item.status === 'resolved') counts.resolved = item.count;
        else if (item.status === 'wont_fix') counts.wont_fix = item.count;
      });

      return { rows, total, counts };
    }),

  getById: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.feedback.findFirst({
        where: eq(feedback.id, input.id),
      });

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return item;
    }),

  getAttachments: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ feedbackId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(feedbackAttachments)
        .where(eq(feedbackAttachments.feedbackId, input.feedbackId))
        .orderBy(feedbackAttachments.sortOrder);
    }),

  updateStatus: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
      status: z.string().optional(),
      adminNotes: z.string().optional(),
      resolutionNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.feedback.findFirst({
        where: eq(feedback.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const updates: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (input.status) {
        updates.status = input.status;
      }

      if (input.adminNotes !== undefined) {
        updates.adminNotes = input.adminNotes;
      }

      // Set resolution info if status indicates resolution
      if (input.status && ['resolved', 'wont_fix'].includes(input.status)) {
        updates.resolvedBy = ctx.user.id;
        updates.resolvedAt = new Date();
      }

      const [updated] = await ctx.db
        .update(feedback)
        .set(updates)
        .where(eq(feedback.id, input.id))
        .returning();

      if (input.status === 'resolved') {
        await promoteResolutionToFaq(ctx.db, existing, input.resolutionNotes);
      }
      // Notify the original submitter when status changes
      if (input.status && existing.userId !== ctx.user.id) {
        const statusLabel: Record<string, string> = {
          in_progress: 'is being worked on',
          resolved: 'has been resolved',
          wont_fix: "won't be changed",
          open: 'has been reopened',
        };
        const label = statusLabel[input.status] || `status changed to ${input.status}`;

        await ctx.db.insert(notifications).values({
          userId: existing.userId,
          type: 'feedback_status_changed',
          message: `Your feedback "${existing.title}" ${label}.${input.adminNotes ? ` Note: ${input.adminNotes}` : ''}`,
          referenceId: existing.id,
          referenceType: 'feedback',
        }).onConflictDoNothing();
      }

      return updated;
    }),

  stats: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const typeStats = await ctx.db
        .select({
          type: feedback.type,
          count: count(),
        })
        .from(feedback)
        .groupBy(feedback.type);

      const statusStats = await ctx.db
        .select({
          status: feedback.status,
          count: count(),
        })
        .from(feedback)
        .groupBy(feedback.status);

      return { typeStats, statusStats };
    }),

  // User-facing: submit feedback (any authenticated user)
  // Auto-captures current page via screenPath from the client
  // Also creates a notification for admin users
  submit: protectedProcedure
    .input(z.object({
      type: z.string().min(1),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      severity: z.string().optional(),
      affectedScope: z.string().optional(), // 'just_me' | 'my_team' | 'everyone'
      screenPath: z.string().optional(),
      screenshot: z.string().optional(),
      screenshots: z.array(z.string()).optional(), // Base64 data URL from html2canvas
    }))
    .mutation(async ({ ctx, input }) => {
      // Look up screenId from screen_inventory by route pattern
      let screenId: string | null = null;
      if (input.screenPath) {
        const screen = await ctx.db.query.screenInventory.findFirst({
          where: eq(screenInventory.routePattern, input.screenPath),
        });
        if (screen) screenId = screen.id;
      }

      const [item] = await ctx.db.insert(feedback).values({
        userId: ctx.user.id,
        type: input.type,
        title: input.title,
        description: input.description || null,
        severity: input.severity || null,
        affectedScope: input.affectedScope || null,
        screenPath: input.screenPath || null,
        screenId,
      }).returning();

      // Save screenshot attachments (Signal parity: up to 5)
      const shots = input.screenshots?.length ? input.screenshots : (input.screenshot ? [input.screenshot] : []);
      for (let i = 0; i < shots.length; i++) {
        await ctx.db.insert(feedbackAttachments).values({
          feedbackId: item.id,
          imageData: shots[i],
          mimeType: 'image/png',
          filename: `screenshot-${i + 1}.png`,
          sortOrder: i,
        });
      }

      // Create notification for all admin users
      const adminUsers = await ctx.db.query.users.findMany({
        where: eq(users.role, 'admin'),
      });

      if (adminUsers.length > 0) {
        const notificationValues = adminUsers.map(adminUser => ({
          userId: adminUser.id,
          type: 'feedback_submitted',
          message: `New ${input.type} feedback from ${ctx.user.name}: "${input.title}"`,
          referenceId: item.id,
          referenceType: 'feedback',
        }));

        await ctx.db.insert(notifications).values(notificationValues).onConflictDoNothing();
      }

      // Track feedback submission for telemetry
      trackActivity(ctx.db, ctx.user.id, 'submit_feedback', input.type, { feedbackId: item.id, title: input.title }).catch(() => {});

      return item;
    }),

  // User-facing: list own submissions
  mySubmissions: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(feedback)
        .where(eq(feedback.userId, ctx.user.id))
        .orderBy(desc(feedback.createdAt))
        .limit(50);
    }),

  reopenMine: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.feedback.findFirst({ where: eq(feedback.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your submission' });
      if (!['resolved', 'wont_fix', 'approved'].includes(existing.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a resolved item can be reopened' });
      }
      const [updated] = await ctx.db.update(feedback).set({
        status: 'open', resolvedAt: null, resolvedBy: null, resolvedByType: 'human', updatedAt: new Date(),
      }).where(eq(feedback.id, input.id)).returning();
      return updated;
    }),
});
