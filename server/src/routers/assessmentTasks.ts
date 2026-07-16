// ============================================================
// ASSESSMENT TASKS ROUTER — CRUD for the task library
// ============================================================

import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { assessmentTasks } from '../db/schema/assessmentTasks.js';
import { auditChange } from '../services/audit.js';

const DIFFICULTY = ['Entry', 'Mid', 'Senior'] as const;
const STATUS = ['Draft', 'In Review', 'Live', 'Retired'] as const;

const TaskInput = z.object({
  title: z.string().min(1).max(300),
  // null/undefined departmentId = General (everyone)
  departmentId: z.string().uuid().nullable().optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
  timeLimitMin: z.number().int().positive().nullable().optional(),
  brief: z.string().optional(),
  showYourWorkInstructions: z.string().optional(),
  scoringGuideWork: z.string().optional(),
  scoringGuideAi: z.string().optional(),
  status: z.enum(STATUS).optional(),
  deliveryMode: z.enum(['take_home', 'live_walkthrough']).optional(),
  version: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export const assessmentTasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.assessmentTasks.findMany({
      orderBy: [asc(assessmentTasks.title)],
    });
  }),

  create: protectedProcedure
    .input(TaskInput)
    .mutation(async ({ ctx, input }) => {
      const [t] = await ctx.db.insert(assessmentTasks)
        .values({ ...input, createdBy: ctx.user.id })
        .returning();
      await auditChange(ctx.db, ctx.user.id, t.id, 'assessment_tasks', 'create');
      return t;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(TaskInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = await ctx.db.query.assessmentTasks.findFirst({ where: eq(assessmentTasks.id, id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const [t] = await ctx.db.update(assessmentTasks)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(assessmentTasks.id, id))
        .returning();
      await auditChange(ctx.db, ctx.user.id, id, 'assessment_tasks', 'update');
      return t;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(assessmentTasks).where(eq(assessmentTasks.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'assessment_tasks', 'delete');
      return { ok: true };
    }),
});
