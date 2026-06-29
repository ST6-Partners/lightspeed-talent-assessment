// ============================================================
// VALUES ROUTER — CRUD for company_values + candidate scoring
// ============================================================

import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { companyValues, candidateValueScores } from '../db/schema/values.js';
import { auditChange } from '../services/audit.js';

const PILLARS = ['Mission-Driven', 'Customer-Obsessed', 'Results-Focused'] as const;

const ValueInput = z.object({
  name: z.string().min(1).max(200),
  pillar: z.enum(PILLARS),
  category: z.string().max(100).optional(),
  description: z.string().optional(),
  eppDimensions: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const valuesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.companyValues.findMany({
      orderBy: [asc(companyValues.sortOrder)],
    });
  }),

  create: protectedProcedure
    .input(ValueInput)
    .mutation(async ({ ctx, input }) => {
      const [v] = await ctx.db.insert(companyValues).values({ ...input }).returning();
      await auditChange(ctx.db, ctx.user.id, v.id, 'company_values', 'create');
      return v;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(ValueInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = await ctx.db.query.companyValues.findFirst({ where: eq(companyValues.id, id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const [v] = await ctx.db.update(companyValues)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(companyValues.id, id))
        .returning();
      await auditChange(ctx.db, ctx.user.id, id, 'company_values', 'update');
      return v;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(companyValues).where(eq(companyValues.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'company_values', 'delete');
      return { ok: true };
    }),

  // ── Candidate scoring ──
  getCandidateScores: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.candidateValueScores.findMany({
        where: eq(candidateValueScores.candidateId, input.candidateId),
      });
    }),

  saveCandidateScores: protectedProcedure
    .input(z.object({
      candidateId: z.string().uuid(),
      scores: z.array(z.object({
        valueId: z.string().uuid(),
        score: z.number().int().min(1).max(5),
        notes: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const s of input.scores) {
        await ctx.db.insert(candidateValueScores).values({
          candidateId: input.candidateId,
          valueId: s.valueId,
          score: s.score,
          notes: s.notes,
          scoredBy: ctx.user.id,
        }).onConflictDoUpdate({
          target: [candidateValueScores.candidateId, candidateValueScores.valueId],
          set: { score: s.score, notes: s.notes, scoredBy: ctx.user.id, updatedAt: new Date() },
        });
      }
      await auditChange(ctx.db, ctx.user.id, input.candidateId, 'candidate_value_scores', 'update');
      return { ok: true, count: input.scores.length };
    }),
});
