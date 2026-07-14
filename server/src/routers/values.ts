// ============================================================
// VALUES ROUTER — values CRUD + EPP + multi-reviewer scoring
// ============================================================

import { z } from 'zod';
import { eq, asc, desc, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { companyValues, candidateValueScores, valueReviews } from '../db/schema/values.js';
import { capabilityItems, candidateCapabilityScores } from '../db/schema/capability.js';
import { candidateEppScores } from '../db/schema/epp.js';
import { employees } from '../db/schema/employees.js';
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
  // ── Values CRUD ──
  list: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.companyValues.findMany({ orderBy: [asc(companyValues.sortOrder)] })),

  // ── Capability items (the "Capability" scorecard section) ──
  listCapabilityItems: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.capabilityItems.findMany({ orderBy: [asc(capabilityItems.sortOrder)] })),

  create: protectedProcedure.input(ValueInput).mutation(async ({ ctx, input }) => {
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
        .set({ ...updates, updatedAt: new Date() }).where(eq(companyValues.id, id)).returning();
      await auditChange(ctx.db, ctx.user.id, id, 'company_values', 'update');
      return v;
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(companyValues).where(eq(companyValues.id, input.id));
    await auditChange(ctx.db, ctx.user.id, input.id, 'company_values', 'delete');
    return { ok: true };
  }),

  // ── Reviewers (employees) ──
  listReviewers: protectedProcedure.query(async ({ ctx }) =>
    ctx.db.query.employees.findMany({ orderBy: [asc(employees.name)] })),

  // ── EPP ──
  getCandidateEpp: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      ctx.db.query.candidateEppScores.findMany({ where: eq(candidateEppScores.candidateId, input.candidateId) })),

  // ── Reviews (one candidate → many reviewer passes) ──
  getCandidateReviews: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const reviews = await ctx.db.query.valueReviews.findMany({
        where: eq(valueReviews.candidateId, input.candidateId),
        orderBy: [desc(valueReviews.reviewedAt)],
      });
      if (!reviews.length) return [];
      const emps = await ctx.db.query.employees.findMany();
      const empName: Record<string, string> = {};
      emps.forEach((e: any) => { empName[e.id] = e.name; });
      const scoreRows = await ctx.db.select().from(candidateValueScores)
        .where(inArray(candidateValueScores.reviewId, reviews.map((r: any) => r.id)));
      const capRows = await ctx.db.select().from(candidateCapabilityScores)
        .where(inArray(candidateCapabilityScores.reviewId, reviews.map((r: any) => r.id)));
      return reviews.map((r: any) => ({
        id: r.id,
        reviewerId: r.reviewerId,
        reviewerName: r.reviewerId ? (empName[r.reviewerId] ?? 'Unknown') : 'Unassigned',
        interviewId: r.interviewId ?? null,
        reviewedAt: r.reviewedAt,
        scores: scoreRows.filter((s: any) => s.reviewId === r.id).map((s: any) => ({ valueId: s.valueId, score: s.score, notes: s.notes })),
        capabilityScores: capRows.filter((s: any) => s.reviewId === r.id).map((s: any) => ({ capabilityItemId: s.capabilityItemId, score: s.score, notes: s.notes })),
      }));
    }),

  saveReview: protectedProcedure
    .input(z.object({
      reviewId: z.string().uuid().optional(),
      candidateId: z.string().uuid(),
      reviewerId: z.string().uuid().optional(),
      interviewId: z.string().uuid().nullable().optional(),
      reviewedAt: z.string().optional(),
      scores: z.array(z.object({
        valueId: z.string().uuid(),
        score: z.number().int().min(1).max(5),
        notes: z.string().optional(),
      })),
      capabilityScores: z.array(z.object({
        capabilityItemId: z.string().uuid(),
        score: z.number().int().min(1).max(5),
        notes: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : new Date();
      const reviewId = await ctx.db.transaction(async (tx) => {
        let rid = input.reviewId;
        if (rid) {
          await tx.update(valueReviews)
            .set({ reviewerId: input.reviewerId ?? null, interviewId: input.interviewId ?? null, reviewedAt, updatedAt: new Date() })
            .where(eq(valueReviews.id, rid));
          await tx.delete(candidateValueScores).where(eq(candidateValueScores.reviewId, rid));
        } else {
          const [r] = await tx.insert(valueReviews).values({
            candidateId: input.candidateId, reviewerId: input.reviewerId ?? null, interviewId: input.interviewId ?? null, reviewedAt,
          }).returning({ id: valueReviews.id });
          rid = r.id;
        }
        if (input.scores.length) {
          await tx.insert(candidateValueScores).values(
            input.scores.map((s) => ({ reviewId: rid!, valueId: s.valueId, score: s.score, notes: s.notes })),
          );
        }
        if (input.capabilityScores) {
          await tx.delete(candidateCapabilityScores).where(eq(candidateCapabilityScores.reviewId, rid!));
          if (input.capabilityScores.length) {
            await tx.insert(candidateCapabilityScores).values(
              input.capabilityScores.map((s) => ({ reviewId: rid!, capabilityItemId: s.capabilityItemId, score: s.score, notes: s.notes })),
            );
          }
        }
        return rid!;
      });
      await auditChange(ctx.db, ctx.user.id, reviewId, 'value_reviews', input.reviewId ? 'update' : 'create');
      return { ok: true, reviewId };
    }),
});
