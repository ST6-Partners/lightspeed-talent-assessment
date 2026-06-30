import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { titles } from '../db/schema/titles.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

const Input = z.object({
  name: z.string().min(1).max(200),
  level: z.string().max(50).optional(),
  department: z.string().max(200).optional(),
});

export const titlesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.titles.findMany({ orderBy: desc(titles.createdAt) })),

  create: protectedProcedure.input(Input).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.insert(titles).values(input).returning();
    await auditChange(ctx.db, ctx.user.id, row.id, 'titles', 'create');
    trackActivity(ctx.db, ctx.user.id, 'create_title', 'titles', { id: row.id }).catch(() => {});
    return row;
  }),

  update: protectedProcedure.input(z.object({ id: z.string().uuid() }).merge(Input.partial()))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.titles.findFirst({ where: eq(titles.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const { id, ...updates } = input;
      const [row] = await ctx.db.update(titles).set({ ...updates, updatedAt: new Date() })
        .where(eq(titles.id, id)).returning();
      await auditChange(ctx.db, ctx.user.id, id, 'titles', 'update');
      return row;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.titles.findFirst({ where: eq(titles.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.delete(titles).where(eq(titles.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'titles', 'delete');
      return { id: input.id };
    }),
});
