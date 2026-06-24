// ============================================================
// ADMIN ROUTER — settings, feedback triage, notifications
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { appSettings } from '../db/schema/core.js';
import { feedback } from '../db/schema/feedback.js';
import { notifications } from '../db/schema/notifications.js';
import { requireAdmin, requireSysadmin } from '../services/permissions.js';

export const adminRouter = router({
  // App Settings CRUD
  getSettings: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      return ctx.db.query.appSettings.findMany();
    }),

  updateSettings: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      key: z.string(),
      value: z.any(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.appSettings.findFirst({
        where: eq(appSettings.key, input.key),
      });
      if (existing) {
        const [setting] = await ctx.db.update(appSettings)
          .set({ value: input.value, updatedBy: ctx.user.id, updatedAt: new Date() })
          .where(eq(appSettings.key, input.key))
          .returning();
        return setting;
      } else {
        const [setting] = await ctx.db.insert(appSettings)
          .values({ key: input.key, value: input.value, updatedBy: ctx.user.id })
          .returning();
        return setting;
      }
    }),

  // Feedback triage
  listFeedback: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.feedback.findMany({
        where: input?.status ? eq(feedback.status, input.status) : undefined,
        orderBy: desc(feedback.createdAt),
      });
    }),

  updateFeedbackStatus: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']),
      adminNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updates: any = {
        status: input.status,
        updatedAt: new Date(),
      };
      if (input.adminNotes) updates.adminNotes = input.adminNotes;
      if (['resolved', 'wont_fix'].includes(input.status)) {
        updates.resolvedBy = ctx.user.id;
        updates.resolvedAt = new Date();
      }
      const [item] = await ctx.db.update(feedback)
        .set(updates)
        .where(eq(feedback.id, input.id))
        .returning();
      return item;
    }),

  // Notifications — broadcast
  broadcastNotification: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      message: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const allUsers = await ctx.db.query.users.findMany({
        where: eq((await import('../db/schema/core.js')).users.isActive, true),
        columns: { id: true },
      });
      const notifs = allUsers.map(u => ({
        userId: u.id,
        type: 'system_broadcast',
        message: input.message,
      }));
      if (notifs.length > 0) {
        await ctx.db.insert(notifications).values(notifs);
      }
      return { sent: notifs.length };
    }),
});
