// ============================================================
// TALENT POOL ROUTER (keep-warm)
//   • list        — pooled candidates across all roles (searchable)
//   • openRoles   — published roles to re-engage a candidate into
//   • add / remove — flag or unflag a candidate as pooled
//   • reactivate  — create a FRESH candidate row for a chosen open role,
//                   copying contact + resume (NOT prior scores — the new
//                   role gets its own evaluation). Records stage history.
//
// The pool is independent of currentStage: a 'Not Selected' or 'Rejected'
// candidate can be pooled and later re-engaged without disturbing their
// original, closed application record.
// ============================================================

import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { candidates, jobDescriptions, candidateStageHistory } from '../db/schema/hiring.js';
import { auditChange } from '../services/audit.js';

export const talentPoolRouter = router({
  // Pooled candidates + the role they originally applied to.
  list: protectedProcedure
    .input(z.object({ q: z.string().max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.candidates.findMany({
        where: eq(candidates.inTalentPool, true),
        orderBy: desc(candidates.talentPoolAddedAt),
      });
      const jds = await ctx.db.query.jobDescriptions.findMany();
      const titleById = new Map(jds.map((j: any) => [j.id, j.jobTitle]));
      const q = (input?.q ?? '').trim().toLowerCase();
      return rows
        .map((c: any) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          priorRole: c.jdId ? (titleById.get(c.jdId) ?? null) : null,
          priorStage: c.currentStage,
          ccatScore: c.ccatScore,
          screenScore: c.screenScore,
          note: c.talentPoolNote,
          addedAt: c.talentPoolAddedAt,
          hasResume: !!(c.resumeText || c.resumeUrl),
        }))
        .filter((c) =>
          !q ||
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.priorRole ?? '').toLowerCase().includes(q));
    }),

  // Published roles a pooled candidate can be re-engaged into.
  openRoles: protectedProcedure.query(async ({ ctx }) => {
    const jds = await ctx.db.query.jobDescriptions.findMany({
      where: eq(jobDescriptions.status, 'Published'),
      orderBy: desc(jobDescriptions.publishedAt),
    });
    return jds.map((j: any) => ({ jdId: j.id, jobTitle: j.jobTitle }));
  }),

  add: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid(), note: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.update(candidates)
        .set({
          inTalentPool: true,
          talentPoolNote: input.note ?? existing.talentPoolNote ?? null,
          talentPoolAddedAt: new Date(),
          talentPoolAddedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, input.candidateId));
      await auditChange(ctx.db, ctx.user.id, input.candidateId, 'candidates', 'update');
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(candidates)
        .set({ inTalentPool: false, talentPoolAddedAt: null, updatedAt: new Date() })
        .where(eq(candidates.id, input.candidateId));
      await auditChange(ctx.db, ctx.user.id, input.candidateId, 'candidates', 'update');
      return { ok: true };
    }),

  // Re-engage: spin up a fresh application for a chosen open role.
  reactivate: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid(), targetJdId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const src = await ctx.db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!src) throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' });
      const jd = await ctx.db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, input.targetJdId) });
      if (!jd) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target role not found' });

      // Guard against a duplicate live application for the same role.
      const dupe = await ctx.db.query.candidates.findFirst({
        where: and(eq(candidates.jdId, input.targetJdId), eq(candidates.email, src.email)),
      });
      if (dupe && !['Rejected', 'Not Selected'].includes(dupe.currentStage as string)) {
        throw new TRPCError({ code: 'CONFLICT', message: `${src.firstName} already has an active application for this role.` });
      }

      const [created] = await ctx.db.insert(candidates).values({
        jdId: input.targetJdId,
        firstName: src.firstName,
        lastName: src.lastName,
        email: src.email,
        phone: src.phone,
        linkedinUrl: src.linkedinUrl,
        resumeUrl: src.resumeUrl,
        resumeText: src.resumeText,
        source: 'Talent Pool',
        currentStage: 'Applied',
      }).returning();

      await ctx.db.insert(candidateStageHistory).values({
        candidateId: created.id,
        fromStage: null,
        toStage: 'Applied',
        changedBy: ctx.user.id,
        reason: `Re-engaged from talent pool (previously ${src.currentStage} for ${jd.jobTitle}).`,
      });

      await auditChange(ctx.db, ctx.user.id, created.id, 'candidates', 'create');
      return { id: created.id, jobTitle: jd.jobTitle };
    }),
});
