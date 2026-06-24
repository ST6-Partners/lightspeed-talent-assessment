// ============================================================
// ONBOARDING VIDEOS ROUTER — CRUD for getting-started video content
// Pattern: RCDO admin resource with sort order, active toggle
// Tables: onboardingVideos, users
// ============================================================

import { z } from 'zod';
import { eq, desc, asc, and, count } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { onboardingVideos } from '../db/schema/system.js';
import { users } from '../db/schema/core.js';
import { requireAdmin } from '../services/permissions.js';

export const onboardingVideosRouter = router({
  // User-facing: list active videos (sorted by sortOrder)
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const filters = [eq(onboardingVideos.isActive, true)];
      if (input?.category) filters.push(eq(onboardingVideos.category, input.category));

      const rows = await ctx.db
        .select({
          id: onboardingVideos.id,
          title: onboardingVideos.title,
          description: onboardingVideos.description,
          url: onboardingVideos.url,
          category: onboardingVideos.category,
          sortOrder: onboardingVideos.sortOrder,
        })
        .from(onboardingVideos)
        .where(and(...filters))
        .orderBy(asc(onboardingVideos.sortOrder), desc(onboardingVideos.createdAt));

      return rows;
    }),

  // Admin: list all videos (including inactive) with creator info
  adminList: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: onboardingVideos.id,
          title: onboardingVideos.title,
          description: onboardingVideos.description,
          url: onboardingVideos.url,
          category: onboardingVideos.category,
          sortOrder: onboardingVideos.sortOrder,
          isActive: onboardingVideos.isActive,
          createdBy: onboardingVideos.createdBy,
          creatorName: users.name,
          createdAt: onboardingVideos.createdAt,
          updatedAt: onboardingVideos.updatedAt,
        })
        .from(onboardingVideos)
        .leftJoin(users, eq(onboardingVideos.createdBy, users.id))
        .orderBy(asc(onboardingVideos.sortOrder), desc(onboardingVideos.createdAt));

      return rows;
    }),

  // Admin: create video
  create: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      url: z.string().url().max(1000),
      category: z.string().max(100).optional(),
      sortOrder: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(onboardingVideos).values({
        title: input.title,
        description: input.description || null,
        url: input.url,
        category: input.category || null,
        sortOrder: input.sortOrder,
        createdBy: ctx.user.id,
      }).returning();
      return row;
    }),

  // Admin: update video
  update: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().optional(),
      url: z.string().url().max(1000).optional(),
      category: z.string().max(100).optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.onboardingVideos.findFirst({
        where: eq(onboardingVideos.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [row] = await ctx.db.update(onboardingVideos)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(onboardingVideos.id, id))
        .returning();
      return row;
    }),

  // Admin: delete video
  delete: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.onboardingVideos.findFirst({
        where: eq(onboardingVideos.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db.delete(onboardingVideos).where(eq(onboardingVideos.id, input.id));
      return { success: true };
    }),

  // Admin: get distinct categories
  categories: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const result = await ctx.db
        .selectDistinct({ category: onboardingVideos.category })
        .from(onboardingVideos)
        .where(eq(onboardingVideos.isActive, true));
      return result.map(r => r.category).filter(Boolean) as string[];
    }),
});
