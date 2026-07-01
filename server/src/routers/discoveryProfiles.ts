// ============================================================
// INSIGHTS DISCOVERY PROFILES ROUTER
// Read/list/delete for uploaded Insights Discovery profiles.
// Upload + parse is handled by the raw Express route
// POST /api/upload/insights-pdf (binary body) in server.ts,
// since tRPC/JSON is a poor fit for PDF bytes.
// ============================================================

import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { insightsDiscoveryProfiles, candidates } from '../db/schema/index.js';
import { deleteFile } from '../services/storage.js';
import { auditChange } from '../services/audit.js';

export const discoveryProfilesRouter = router({
  // All profiles for one candidate (newest first).
  byCandidate: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.insightsDiscoveryProfiles.findMany({
        where: eq(insightsDiscoveryProfiles.candidateId, input.candidateId),
        orderBy: [desc(insightsDiscoveryProfiles.createdAt)],
      });
    }),

  // One profile by id.
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.insightsDiscoveryProfiles.findFirst({
        where: eq(insightsDiscoveryProfiles.id, input.id),
      });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
      return row;
    }),

  // All profiles, joined with candidate name — powers the Discovery Profiles tab list.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: insightsDiscoveryProfiles.id,
        candidateId: insightsDiscoveryProfiles.candidateId,
        candidateFirstName: candidates.firstName,
        candidateLastName: candidates.lastName,
        pdfKey: insightsDiscoveryProfiles.pdfKey,
        pdfFilename: insightsDiscoveryProfiles.pdfFilename,
        typeNumber: insightsDiscoveryProfiles.typeNumber,
        typeName: insightsDiscoveryProfiles.typeName,
        lcTypeNumber: insightsDiscoveryProfiles.lcTypeNumber,
        lcTypeName: insightsDiscoveryProfiles.lcTypeName,
        conscious: insightsDiscoveryProfiles.conscious,
        lessConscious: insightsDiscoveryProfiles.lessConscious,
        parseStatus: insightsDiscoveryProfiles.parseStatus,
        createdAt: insightsDiscoveryProfiles.createdAt,
      })
      .from(insightsDiscoveryProfiles)
      .leftJoin(candidates, eq(insightsDiscoveryProfiles.candidateId, candidates.id))
      .orderBy(desc(insightsDiscoveryProfiles.createdAt));
    return rows;
  }),

  // Delete a profile and its stored PDF.
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.insightsDiscoveryProfiles.findFirst({
        where: eq(insightsDiscoveryProfiles.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });

      // Best-effort object-storage cleanup; DB row removal is the source of truth.
      if (existing.pdfKey) { try { await deleteFile(existing.pdfKey); } catch { /* ignore */ } }

      await ctx.db.delete(insightsDiscoveryProfiles).where(eq(insightsDiscoveryProfiles.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'insights_discovery_profile', 'delete').catch(() => {});
      return { ok: true };
    }),
});
