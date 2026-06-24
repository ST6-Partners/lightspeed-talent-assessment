// ============================================================
// AUTH ROUTER — email/password + sessions (Sequence 3, 2026-06-05)
//
// Replaces the WorkOS-backed router. Adds login / register / logout
// as tRPC mutations that set/clear req.session.userId. The existing
// me / updateTimezone / admin user-management procedures are kept.
//
// First account created (or any matching SEED_SUPER_ADMIN_EMAIL)
// becomes sysadmin so the app can be bootstrapped with no seed step.
// ============================================================

import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { users } from '../db/schema/core.js';
import { requireAdmin } from '../services/permissions.js';
import { hashPassword, verifyPassword, mintToken } from '../auth.js';
import { env } from '../env.js';

export const authRouter = router({
  // Current user — or null if unauthenticated.
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const dbUser = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: { id: true, name: true, email: true, role: true, isBeta: true, timezone: true },
    });
    return dbUser ?? null;
  }),

  // ── Register a new account (email/password) ────────────────
  // The first account, or one matching SEED_SUPER_ADMIN_EMAIL, becomes
  // sysadmin. Sets the session so the user is logged in immediately.
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8, 'Password must be at least 8 characters'),
      name: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const existing = await ctx.db.query.users.findFirst({ where: eq(users.email, email) });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'An account with that email already exists. Try signing in.' });

      const countRes = await ctx.db.select({ c: sql<number>`count(*)` }).from(users);
      const isFirstUser = Number(countRes[0]?.c ?? 0) === 0;
      const seedEmail = env.SEED_SUPER_ADMIN_EMAIL;
      const role = (isFirstUser || (!!seedEmail && email === seedEmail)) ? 'sysadmin' : 'user';

      const passwordHash = await hashPassword(input.password);
      const [u] = await ctx.db.insert(users).values({
        sub: `local:${email}`,            // local identity id (replaces WorkOS sub)
        email,
        name: input.name ?? null,
        role,
        passwordHash,
        lastLoginAt: new Date(),
      }).returning();

      ctx.req.session.userId = u.id;
      return { success: true, role, token: mintToken(u.id) };
    }),

  // ── Log in ─────────────────────────────────────────────────
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const u = await ctx.db.query.users.findFirst({ where: eq(users.email, email) });
      const bad = () => new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      if (!u || !u.passwordHash || !u.isActive) throw bad();
      const ok = await verifyPassword(input.password, u.passwordHash);
      if (!ok) throw bad();

      ctx.req.session.userId = u.id;
      await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
      return { success: true, token: mintToken(u.id) };
    }),

  // ── Log out ────────────────────────────────────────────────
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await new Promise<void>((resolve) => {
      ctx.req.session.destroy(() => resolve());
    });
    ctx.res.clearCookie('tmpl.sid');
    return { success: true };
  }),

  // ── Change own password ────────────────────────────────────
  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const u = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.user.id) });
      if (!u || !u.passwordHash) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set for this account' });
      const ok = await verifyPassword(input.currentPassword, u.passwordHash);
      if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
      await ctx.db.update(users)
        .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // Update own timezone — called from frontend on app load.
  updateTimezone: protectedProcedure
    .input(z.object({ timezone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(users)
        .set({ timezone: input.timezone, lastActiveAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // Admin: list all users (password hashes never exposed).
  listUsers: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      return ctx.db.query.users.findMany({
        columns: {
          id: true, sub: true, externalId: true, name: true, email: true, title: true, role: true,
          connectionType: true, isActive: true, isBeta: true, timezone: true,
          lastActiveAt: true, lastLoginAt: true,
        },
      });
    }),

  // Admin: update a user's app-level fields.
  updateUser: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      role: z.enum(['user', 'manager', 'admin', 'sysadmin']).optional(),
      isActive: z.boolean().optional(),
      isBeta: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [user] = await ctx.db.update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      return user;
    }),

  // Admin: reset ANOTHER user's password (no current password required).
  // This is the recovery path for locked-out users, since there is no
  // email-based "forgot password". Admin/sysadmin only (requireAdmin).
  resetUserPassword: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ userId: z.string().uuid(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      await ctx.db.update(users)
        .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),
});
