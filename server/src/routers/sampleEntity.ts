// ============================================================
// SAMPLE ENTITY ROUTER — full CRUD with permissions + audit (DD-015)
// Adopters rename this to their domain router.
// ============================================================

import { z } from 'zod';
import { eq, isNull, isNotNull, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { sampleEntities } from '../db/schema/sampleEntity.js';
import { users } from '../db/schema/core.js';
import { checkPermission, requireAdmin } from '../services/permissions.js';
import { auditChange, auditFieldChanges } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

export const sampleEntityRouter = router({
  list: protectedProcedure
    .input(z.object({
      includeArchived: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.query.sampleEntities.findMany({
        where: input?.includeArchived ? undefined : isNull(sampleEntities.archivedAt),
        orderBy: desc(sampleEntities.createdAt),
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const entity = await ctx.db.query.sampleEntities.findFirst({
        where: eq(sampleEntities.id, input.id),
      });
      if (!entity) throw new TRPCError({ code: 'NOT_FOUND' });
      return entity;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(500),
      description: z.string().optional(),
      entityType: z.string().default('default'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [entity] = await ctx.db.insert(sampleEntities).values({
        ...input,
        ownerId: ctx.user.id,
      }).returning();

      await auditChange(ctx.db, ctx.user.id, entity.id, 'sample_entities', 'create');
      trackActivity(ctx.db, ctx.user.id, 'create_item', 'sample_entities', { entityId: entity.id, name: input.name }).catch(() => {});
      return entity;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(500).optional(),
      description: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sampleEntities.findFirst({
        where: eq(sampleEntities.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const perm = await checkPermission(ctx.db, ctx.user.id, input.id, 'edit', {
        ownerId: existing.ownerId,
      });
      if (!perm.allowed) throw new TRPCError({ code: 'FORBIDDEN', message: perm.reason });

      const { id, ...updates } = input;
      const [entity] = await ctx.db.update(sampleEntities)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(sampleEntities.id, id))
        .returning();

      // Per-field audit (RCDO pattern)
      await auditFieldChanges(ctx.db, ctx.user.id, id, 'sample_entities', existing, updates);
      trackActivity(ctx.db, ctx.user.id, 'update_item', 'sample_entities', { entityId: id }).catch(() => {});
      return entity;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sampleEntities.findFirst({
        where: eq(sampleEntities.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const perm = await checkPermission(ctx.db, ctx.user.id, input.id, 'archive', {
        ownerId: existing.ownerId,
      });
      if (!perm.allowed) throw new TRPCError({ code: 'FORBIDDEN', message: perm.reason });

      const [entity] = await ctx.db.update(sampleEntities)
        .set({ archivedAt: new Date(), archivedBy: ctx.user.id })
        .where(eq(sampleEntities.id, input.id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, input.id, 'sample_entities', 'archive');
      // Track archive event for telemetry
      trackActivity(ctx.db, ctx.user.id, 'archive_item', 'sample_entities', { entityId: input.id }).catch(() => {});
      return entity;
    }),

  // Restore an archived entity (admin-only, RCDO pattern)
  restore: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sampleEntities.findFirst({
        where: eq(sampleEntities.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!existing.archivedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Entity is not archived' });

      const [entity] = await ctx.db.update(sampleEntities)
        .set({ archivedAt: null, archivedBy: null })
        .where(eq(sampleEntities.id, input.id))
        .returning();

      await auditChange(ctx.db, ctx.user.id, input.id, 'sample_entities', 'update', {
        field: 'archivedAt',
        oldValue: existing.archivedAt?.toISOString() || null,
        newValue: null,
      });
      // Track restore event for telemetry
      trackActivity(ctx.db, ctx.user.id, 'restore_item', 'sample_entities', { entityId: input.id }).catch(() => {});
      return entity;
    }),

  // List archived entities with owner + archiver info (admin-only, RCDO pattern)
  listArchived: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      entityType: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Use raw SQL to join two aliases of users (owner + archiver)
      const filters = [];
      if (input?.entityType) {
        filters.push(sql`se.entity_type = ${input.entityType}`);
      }
      if (input?.search) {
        filters.push(sql`(se.name ILIKE ${'%' + input.search + '%'} OR se.description ILIKE ${'%' + input.search + '%'})`);
      }
      filters.push(sql`se.archived_at IS NOT NULL`);

      const whereClause = sql.join(filters, sql` AND `);

      const rows = await ctx.db.execute(sql`
        SELECT
          se.id,
          se.name,
          se.description,
          se.entity_type as "entityType",
          se.status,
          se.archived_at as "archivedAt",
          owner.name as "ownerName",
          archiver.name as "archivedByName"
        FROM sample_entities se
        LEFT JOIN users owner ON se.owner_id = owner.id
        LEFT JOIN users archiver ON se.archived_by = archiver.id
        WHERE ${whereClause}
        ORDER BY se.archived_at DESC
      `);

      return rows.rows as Array<{
        id: string;
        name: string;
        description: string | null;
        entityType: string;
        status: string;
        archivedAt: string;
        ownerName: string | null;
        archivedByName: string | null;
      }>;
    }),
});
