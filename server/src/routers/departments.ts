// ============================================================
// DEPARTMENTS ROUTER — CRUD for the curated department list
// ============================================================

import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { departments } from '../db/schema/departments.js';
import { auditChange } from '../services/audit.js';

const DepartmentInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const departmentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.departments.findMany({
      orderBy: [asc(departments.sortOrder), asc(departments.name)],
    });
  }),

  create: protectedProcedure
    .input(DepartmentInput)
    .mutation(async ({ ctx, input }) => {
      const [d] = await ctx.db.insert(departments).values({ ...input }).returning();
      await auditChange(ctx.db, ctx.user.id, d.id, 'departments', 'create');
      return d;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(DepartmentInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = await ctx.db.query.departments.findFirst({ where: eq(departments.id, id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const [d] = await ctx.db.update(departments)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(departments.id, id))
        .returning();
      await auditChange(ctx.db, ctx.user.id, id, 'departments', 'update');
      return d;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(departments).where(eq(departments.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'departments', 'delete');
      return { ok: true };
    }),
});
