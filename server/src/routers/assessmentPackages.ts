// ============================================================
// ASSESSMENT PACKAGES ROUTER — CRUD for assignments (task pairings)
// plus byDepartment routing lookup (role applied for -> assignment).
// ============================================================

import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { assessmentPackages } from '../db/schema/assessmentPackages.js';
import { auditChange } from '../services/audit.js';

const STATUS = ['Draft', 'In Review', 'Live', 'Retired'] as const;

const PackageInput = z.object({
  name: z.string().min(1).max(300),
  departmentId: z.string().uuid().nullable().optional(),
  generalTaskId: z.string().uuid().nullable().optional(),
  functionalTaskId: z.string().uuid().nullable().optional(),
  status: z.enum(STATUS).optional(),
  version: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export const assessmentPackagesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.assessmentPackages.findMany({
      orderBy: [asc(assessmentPackages.name)],
    });
  }),

  // Routing rule: the department a candidate applied for selects the
  // live assignment. Returns the active, Live package for a department.
  byDepartment: protectedProcedure
    .input(z.object({ departmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.assessmentPackages.findFirst({
        where: and(
          eq(assessmentPackages.departmentId, input.departmentId),
          eq(assessmentPackages.status, 'Live'),
          eq(assessmentPackages.active, true),
        ),
      });
    }),

  create: protectedProcedure
    .input(PackageInput)
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.insert(assessmentPackages)
        .values({ ...input, createdBy: ctx.user.id })
        .returning();
      await auditChange(ctx.db, ctx.user.id, p.id, 'assessment_packages', 'create');
      return p;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(PackageInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = await ctx.db.query.assessmentPackages.findFirst({ where: eq(assessmentPackages.id, id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const [p] = await ctx.db.update(assessmentPackages)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(assessmentPackages.id, id))
        .returning();
      await auditChange(ctx.db, ctx.user.id, id, 'assessment_packages', 'update');
      return p;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(assessmentPackages).where(eq(assessmentPackages.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'assessment_packages', 'delete');
      return { ok: true };
    }),
});
