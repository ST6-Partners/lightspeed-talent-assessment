import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { employees } from '../db/schema/employees.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

const Input = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  email: z.string().email().max(300).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export const employeesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.employees.findMany({ orderBy: desc(employees.createdAt) })),

  create: protectedProcedure.input(Input).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db.insert(employees).values({ ...input, email: input.email || null }).returning();
    await auditChange(ctx.db, ctx.user.id, row.id, 'employees', 'create');
    trackActivity(ctx.db, ctx.user.id, 'create_employee', 'employees', { id: row.id }).catch(() => {});
    return row;
  }),

  update: protectedProcedure.input(z.object({ id: z.string().uuid() }).merge(Input.partial()))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.employees.findFirst({ where: eq(employees.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const { id, ...updates } = input;
      const [row] = await ctx.db.update(employees)
        .set({ ...updates, ...(updates.email !== undefined ? { email: updates.email || null } : {}), updatedAt: new Date() })
        .where(eq(employees.id, id)).returning();
      await auditChange(ctx.db, ctx.user.id, id, 'employees', 'update');
      return row;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.employees.findFirst({ where: eq(employees.id, input.id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.delete(employees).where(eq(employees.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'employees', 'delete');
      return { id: input.id };
    }),
});
