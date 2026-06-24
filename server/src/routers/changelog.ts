// ============================================================
// CHANGELOG ROUTER — change log queries and audit statistics
// Tables: changeLog, users
// ============================================================

import { z } from 'zod';
import { eq, desc, and, gte, lte, count, isNotNull, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { changeLog, changeBatches } from '../db/schema/audit.js';
import { users } from '../db/schema/core.js';

export const changelogRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
      userId: z.string().uuid().optional(),
      entityType: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, limit, userId, entityType, startDate, endDate } = input;
      const offset = (page - 1) * limit;

      // Build filters
      const filters = [];
      if (userId) filters.push(eq(changeLog.userId, userId));
      if (entityType) filters.push(eq(changeLog.entityType, entityType));
      if (startDate) filters.push(gte(changeLog.createdAt, new Date(startDate)));
      if (endDate) filters.push(lte(changeLog.createdAt, new Date(endDate)));

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      // Fetch rows with user join
      const rows = await ctx.db
        .select({
          id: changeLog.id,
          userId: changeLog.userId,
          userName: users.name,
          entityId: changeLog.entityId,
          entityType: changeLog.entityType,
          action: changeLog.action,
          field: changeLog.field,
          oldValue: changeLog.oldValue,
          newValue: changeLog.newValue,
          batchId: changeLog.batchId,
          createdAt: changeLog.createdAt,
        })
        .from(changeLog)
        .leftJoin(users, eq(changeLog.userId, users.id))
        .where(whereClause)
        .orderBy(desc(changeLog.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const totalResult = await ctx.db
        .select({ count: count() })
        .from(changeLog)
        .where(whereClause);
      const total = totalResult[0].count;

      return { rows, total };
    }),

  stats: protectedProcedure
    .query(async ({ ctx }) => {
      // Count by action type
      const results = await ctx.db
        .select({
          action: changeLog.action,
          count: count(),
        })
        .from(changeLog)
        .groupBy(changeLog.action);

      return results;
    }),

  // ── Batch view — changes grouped by change_batches (RCDO pattern) ──
  batches: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(50).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      // Get batches with creator info
      const batchRows = await ctx.db
        .select({
          id: changeBatches.id,
          name: changeBatches.name,
          sourceType: changeBatches.sourceType,
          status: changeBatches.status,
          changeCount: changeBatches.changeCount,
          createdByName: users.name,
          createdAt: changeBatches.createdAt,
        })
        .from(changeBatches)
        .leftJoin(users, eq(changeBatches.createdBy, users.id))
        .orderBy(desc(changeBatches.createdAt))
        .limit(limit)
        .offset(offset);

      const totalResult = await ctx.db
        .select({ count: count() })
        .from(changeBatches);
      const total = totalResult[0].count;

      return { batches: batchRows, total };
    }),

  // ── Batch detail — all changes in a specific batch ─────────
  batchDetail: protectedProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const batch = await ctx.db
        .select({
          id: changeBatches.id,
          name: changeBatches.name,
          sourceType: changeBatches.sourceType,
          status: changeBatches.status,
          changeCount: changeBatches.changeCount,
          createdByName: users.name,
          createdAt: changeBatches.createdAt,
        })
        .from(changeBatches)
        .leftJoin(users, eq(changeBatches.createdBy, users.id))
        .where(eq(changeBatches.id, input.batchId));

      if (!batch[0]) return null;

      const changes = await ctx.db
        .select({
          id: changeLog.id,
          entityId: changeLog.entityId,
          entityType: changeLog.entityType,
          action: changeLog.action,
          field: changeLog.field,
          oldValue: changeLog.oldValue,
          newValue: changeLog.newValue,
          userName: users.name,
          createdAt: changeLog.createdAt,
        })
        .from(changeLog)
        .leftJoin(users, eq(changeLog.userId, users.id))
        .where(eq(changeLog.batchId, input.batchId))
        .orderBy(desc(changeLog.createdAt));

      return { batch: batch[0], changes };
    }),
});
