// ============================================================
// JOB DESCRIPTIONS ROUTER — CRUD for job_descriptions
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { jobDescriptions } from '../db/schema/hiring.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

// All 13 Lightspeed company values for EPP matching
export const LIGHTSPEED_VALUES = [
  // Approach
  'Coachable',
  'Purposeful',
  'Resilient',
  // Team
  'Collaborative',
  'Humble',
  'Transparent',
  // Individual
  'Accountable',
  'Courageous',
  'Creative',
  'Driven',
  'Focused',
  'High Standards',
  'Self-Aware',
] as const;

const JdInput = z.object({
  reqId: z.string().uuid(),
  jobTitle: z.string().min(1).max(300),
  summary: z.string().optional(),
  responsibilities: z.string().optional(),
  requiredQualifications: z.string().optional(),
  preferredQualifications: z.string().optional(),
  ccatThreshold: z.number().int().min(0).max(50).default(30),
  eppValues: z.array(z.string()).default([]),
  workSampleInstructions: z.string().optional(),
});

export const jobDescriptionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      reqId: z.string().uuid().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.jobDescriptions.findMany({
        orderBy: desc(jobDescriptions.createdAt),
      });
      let result = rows;
      if (input?.reqId) result = result.filter((r) => r.reqId === input.reqId);
      if (input?.status) result = result.filter((r) => r.status === input.status);
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const jd = await ctx.db.query.jobDescriptions.findFirst({
        where: eq(jobDescriptions.id, input.id),
      });
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND' });
      return jd;
    }),

  create: protectedProcedure
    .input(JdInput)
    .mutation(async ({ ctx, input }) => {
      const [jd] = await ctx.db.insert(jobDescriptions).values(input).returning();

      await auditChange(ctx.db, ctx.user.id, jd.id, 'job_descriptions', 'create');
      trackActivity(ctx.db, ctx.user.id, 'create_job_description', 'job_descriptions', { jdId: jd.id }).catch(() => {});
      return jd;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(JdInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jobDescriptions.findFirst({
        where: eq(jobDescriptions.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [jd] = await ctx.db.update(jobDescriptions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(jobDescriptions.id, id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, id, 'job_descriptions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'update_job_description', 'job_descriptions', { jdId: id }).catch(() => {});
      return jd;
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jobDescriptions.findFirst({
        where: eq(jobDescriptions.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.status === 'Published') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Job description is already published' });
      }

      const [jd] = await ctx.db.update(jobDescriptions)
        .set({ status: 'Published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(jobDescriptions.id, input.id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, input.id, 'job_descriptions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'publish_job_description', 'job_descriptions', { jdId: input.id }).catch(() => {});
      return jd;
    }),

  // Returns the full list of Lightspeed values for the EPP values picker
  getValues: protectedProcedure
    .query(async () => {
      return LIGHTSPEED_VALUES;
    }),
});
