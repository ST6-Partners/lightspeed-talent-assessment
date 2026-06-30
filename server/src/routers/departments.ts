import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { departments } from '../db/schema/departments.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

const Input = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const departmentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.departments.findMany({ orderBy: desc(departments.createdAt) })),

  create: protectedProcedure.input(Input).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.insert(departments).values(input).returning();
    await auditChange(ctx.db, ctx.user.id, row.id, 'departments', 'create');
    trackActivity(ctx.db, ctx.user.id, 'create_department', 'departments', { id: row.id }).catch(() => {});
    return row;
  }),

  update: protectedProcedure.input(z.object({ id: z.string().uuid() }).merge(Input.partial()))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.departments.findFirst({ where: eq(departments.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const { id, ...updates } = input;
      const [row] = await ctx.db.update(departments).set({ ...updates, updatedAt: new Date() })
        .where(eq(departments.id, id)).returning();
      await auditChange(ctx.db, ctx.user.id, id, 'departments', 'update');
      return row;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.departments.findFirst({ where: eq(departments.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.delete(departments).where(eq(departments.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'departments', 'delete');
      return { id: input.id };
    }),
});
