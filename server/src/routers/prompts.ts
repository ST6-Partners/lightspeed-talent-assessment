// ============================================================
// PROMPTS ROUTER — prompt template management (sysadmin only)
// Tables: promptTemplates
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { promptTemplates } from '../db/schema/ai.js';
import { requireSysadmin } from '../services/permissions.js';

export const promptsRouter = router({
  list: protectedProcedure
    .use(requireSysadmin)
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select()
        .from(promptTemplates)
        .orderBy(promptTemplates.key, desc(promptTemplates.version));

      return rows;
    }),

  getById: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.promptTemplates.findFirst({
        where: eq(promptTemplates.id, input.id),
      });

      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return item;
    }),

  update: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      id: z.string().uuid(),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the existing template
      const existing = await ctx.db.query.promptTemplates.findFirst({
        where: eq(promptTemplates.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Set old one to inactive
      await ctx.db
        .update(promptTemplates)
        .set({ isActive: false })
        .where(eq(promptTemplates.id, input.id));

      // Create new version
      const [newVersion] = await ctx.db
        .insert(promptTemplates)
        .values({
          key: existing.key,
          version: existing.version + 1,
          content: input.content,
          isActive: true,
          createdBy: ctx.user.id,
        })
        .returning();

      return newVersion;
    }),

  create: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      key: z.string(),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [newTemplate] = await ctx.db
        .insert(promptTemplates)
        .values({
          key: input.key,
          version: 1,
          content: input.content,
          isActive: true,
          createdBy: ctx.user.id,
        })
        .returning();

      return newTemplate;
    }),
});
