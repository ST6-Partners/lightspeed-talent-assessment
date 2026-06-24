// ============================================================
// RELEASES ROUTER — release notes CRUD + publish + user-facing (RCDO pattern)
// Tables: releaseNotes, notifications, users
// ============================================================

import { z } from 'zod';
import { eq, desc, isNotNull, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { releaseNotes } from '../db/schema/notifications.js';
import { notifications } from '../db/schema/notifications.js';
import { users } from '../db/schema/core.js';
import { requireAdmin } from '../services/permissions.js';

export const releasesRouter = router({

  // ── Admin: list all releases (drafts + published) ──────────
  list: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: releaseNotes.id,
          version: releaseNotes.version,
          title: releaseNotes.title,
          content: releaseNotes.content,
          publishedAt: releaseNotes.publishedAt,
          createdBy: releaseNotes.createdBy,
          createdByName: users.name,
          createdAt: releaseNotes.createdAt,
        })
        .from(releaseNotes)
        .leftJoin(users, eq(releaseNotes.createdBy, users.id))
        .orderBy(desc(releaseNotes.createdAt));

      return rows;
    }),

  // ── Admin: get single release by ID ────────────────────────
  getById: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(releaseNotes)
        .where(eq(releaseNotes.id, input.id));
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      return rows[0];
    }),

  // ── Admin: create a new release (draft) ────────────────────
  create: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      version: z.string().min(1).max(50),
      title: z.string().min(1).max(500),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [release] = await ctx.db.insert(releaseNotes).values({
        version: input.version,
        title: input.title,
        content: input.content,
        createdBy: ctx.user.id,
      }).returning();
      return release;
    }),

  // ── Admin: update a release ────────────────────────────────
  update: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
      version: z.string().min(1).max(50).optional(),
      title: z.string().min(1).max(500).optional(),
      content: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(releaseNotes).where(eq(releaseNotes.id, input.id));
      if (!existing[0]) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [release] = await ctx.db.update(releaseNotes)
        .set(updates)
        .where(eq(releaseNotes.id, id))
        .returning();
      return release;
    }),

  // ── Admin: publish a release (sets publishedAt + notifies all users) ──
  publish: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(releaseNotes).where(eq(releaseNotes.id, input.id));
      if (!existing[0]) throw new TRPCError({ code: 'NOT_FOUND' });

      const [release] = await ctx.db.update(releaseNotes)
        .set({ publishedAt: new Date() })
        .where(eq(releaseNotes.id, input.id))
        .returning();

      // Broadcast notification to all active users
      const allUsers = await ctx.db.select({ id: users.id }).from(users)
        .where(eq(users.isActive, true));

      if (allUsers.length > 0) {
        await ctx.db.insert(notifications).values(
          allUsers.map(u => ({
            userId: u.id,
            type: 'release_published',
            message: `New release: ${release.version} — ${release.title}`,
            referenceId: release.id,
            referenceType: 'release_notes',
          }))
        );
      }

      return { release, notified: allUsers.length };
    }),

  // ── Admin: unpublish a release ─────────────────────────────
  unpublish: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [release] = await ctx.db.update(releaseNotes)
        .set({ publishedAt: null })
        .where(eq(releaseNotes.id, input.id))
        .returning();
      if (!release) throw new TRPCError({ code: 'NOT_FOUND' });
      return release;
    }),

  // ── Admin: delete a draft release ──────────────────────────
  delete: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(releaseNotes).where(eq(releaseNotes.id, input.id));
      if (!existing[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing[0].publishedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete a published release. Unpublish first.' });
      }
      await ctx.db.delete(releaseNotes).where(eq(releaseNotes.id, input.id));
      return { deleted: true };
    }),

  // ── User-facing: get latest published release ──────────────
  latest: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: releaseNotes.id,
          version: releaseNotes.version,
          title: releaseNotes.title,
          content: releaseNotes.content,
          publishedAt: releaseNotes.publishedAt,
        })
        .from(releaseNotes)
        .where(isNotNull(releaseNotes.publishedAt))
        .orderBy(desc(releaseNotes.publishedAt))
        .limit(1);

      return rows[0] || null;
    }),

  // ── User-facing: list all published releases ───────────────
  published: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: releaseNotes.id,
          version: releaseNotes.version,
          title: releaseNotes.title,
          content: releaseNotes.content,
          publishedAt: releaseNotes.publishedAt,
        })
        .from(releaseNotes)
        .where(isNotNull(releaseNotes.publishedAt))
        .orderBy(desc(releaseNotes.publishedAt));

      return rows;
    }),
});
