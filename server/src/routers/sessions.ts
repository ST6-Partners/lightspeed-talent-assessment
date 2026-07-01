// ============================================================
// ASSESSMENT SESSIONS ROUTER
// Admin side (protected): list + schedule timed take-home deliveries.
// Candidate side (public, token-guarded): getByToken / start / submit.
// The candidate is unauthenticated — the unguessable token is the key,
// and scoring guides / score fields are NEVER exposed to them.
// ============================================================

import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { assessmentSessions } from '../db/schema/assessmentSessions.js';
import { assessmentPackages } from '../db/schema/assessmentPackages.js';
import { assessmentTasks } from '../db/schema/assessmentTasks.js';
import { auditChange } from '../services/audit.js';

// Random 64-char hex token (32 bytes) — unguessable candidate access key.
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export const sessionsRouter = router({
  // ── ADMIN ──────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.assessmentSessions.findMany({
      orderBy: [desc(assessmentSessions.createdAt)],
    });
  }),

  schedule: protectedProcedure
    .input(z.object({
      packageId: z.string().uuid(),
      candidateEmail: z.string().email(),
      candidateId: z.string().uuid().optional(),
      scheduledStart: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [s] = await ctx.db.insert(assessmentSessions)
        .values({
          packageId: input.packageId,
          candidateEmail: input.candidateEmail,
          candidateId: input.candidateId ?? null,
          token: generateToken(),
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
          status: 'scheduled',
        })
        .returning();
      await auditChange(ctx.db, ctx.user.id, s.id, 'assessment_sessions', 'create');
      return s;
    }),

  // ── CANDIDATE (public, token-guarded) ──────────────────
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.query.assessmentSessions.findFirst({
        where: eq(assessmentSessions.token, input.token),
      });
      if (!session) throw new TRPCError({ code: 'NOT_FOUND' });

      const pkg = session.packageId
        ? await ctx.db.query.assessmentPackages.findFirst({
            where: eq(assessmentPackages.id, session.packageId),
          })
        : null;

      const loadTask = async (id: string | null | undefined) => {
        if (!id) return null;
        const t = await ctx.db.query.assessmentTasks.findFirst({
          where: eq(assessmentTasks.id, id),
        });
        if (!t) return null;
        // Only candidate-facing fields — never the scoring guides.
        return {
          title: t.title,
          brief: t.brief,
          showYourWorkInstructions: t.showYourWorkInstructions,
          timeLimitMin: t.timeLimitMin,
        };
      };

      const generalTask = await loadTask(pkg?.generalTaskId);
      const functionalTask = await loadTask(pkg?.functionalTaskId);

      return {
        session: {
          id: session.id,
          status: session.status,
          scheduledStart: session.scheduledStart,
          startedAt: session.startedAt,
          dueAt: session.dueAt,
          submittedAt: session.submittedAt,
          candidateEmail: session.candidateEmail,
          generalResponse: session.generalResponse,
          generalShowWork: session.generalShowWork,
          functionalResponse: session.functionalResponse,
          functionalShowWork: session.functionalShowWork,
        },
        package: pkg
          ? {
              id: pkg.id,
              name: pkg.name,
              windowMinutes: pkg.windowMinutes,
              deliveryMode: pkg.deliveryMode,
            }
          : null,
        generalTask,
        functionalTask,
        serverNow: new Date().toISOString(),
      };
    }),

  start: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.assessmentSessions.findFirst({
        where: eq(assessmentSessions.token, input.token),
      });
      if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
      if (session.status !== 'scheduled') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Session already started' });
      }

      const pkg = session.packageId
        ? await ctx.db.query.assessmentPackages.findFirst({
            where: eq(assessmentPackages.id, session.packageId),
          })
        : null;

      const now = new Date();
      if (
        pkg?.deliveryMode === 'scheduled' &&
        session.scheduledStart &&
        now < session.scheduledStart
      ) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Session has not unlocked yet' });
      }

      const windowMinutes = pkg?.windowMinutes ?? 90;
      const dueAt = new Date(now.getTime() + windowMinutes * 60000);

      const [s] = await ctx.db.update(assessmentSessions)
        .set({ startedAt: now, dueAt, status: 'in_progress', updatedAt: now })
        .where(eq(assessmentSessions.id, session.id))
        .returning();
      return s;
    }),

  submit: publicProcedure
    .input(z.object({
      token: z.string(),
      generalResponse: z.string().optional(),
      generalShowWork: z.string().optional(),
      functionalResponse: z.string().optional(),
      functionalShowWork: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.query.assessmentSessions.findFirst({
        where: eq(assessmentSessions.token, input.token),
      });
      if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
      if (session.status !== 'in_progress') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Session is not in progress' });
      }

      const now = new Date();
      if (session.dueAt && now > session.dueAt) {
        await ctx.db.update(assessmentSessions)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(assessmentSessions.id, session.id));
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Time is up' });
      }

      const [s] = await ctx.db.update(assessmentSessions)
        .set({
          generalResponse: input.generalResponse ?? null,
          generalShowWork: input.generalShowWork ?? null,
          functionalResponse: input.functionalResponse ?? null,
          functionalShowWork: input.functionalShowWork ?? null,
          submittedAt: now,
          status: 'submitted',
          updatedAt: now,
        })
        .where(eq(assessmentSessions.id, session.id))
        .returning();
      return s;
    }),
});
