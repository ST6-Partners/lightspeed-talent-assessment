// ============================================================
// ASSESSMENT TASKS ROUTER — CRUD for the task library
// ============================================================

import { z } from 'zod';
import { eq, asc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { assessmentTasks } from '../db/schema/assessmentTasks.js';
import { auditChange } from '../services/audit.js';
import { draftTaskFromUpload, isSupportedUploadType } from '../services/ai.js';

const DIFFICULTY = ['Entry', 'Mid', 'Senior'] as const;
const STATUS = ['Draft', 'In Review', 'Live', 'Retired'] as const;

const TaskInput = z.object({
  title: z.string().min(1).max(300),
  // null/undefined departmentId = General (everyone)
  departmentId: z.string().uuid().nullable().optional(),
  difficulty: z.enum(DIFFICULTY).optional(),
  timeLimitMin: z.number().int().positive().nullable().optional(),
  brief: z.string().optional(),
  showYourWorkInstructions: z.string().optional(),
  scoringGuideWork: z.string().optional(),
  scoringGuideAi: z.string().optional(),
  status: z.enum(STATUS).optional(),
  deliveryMode: z.enum(['take_home', 'live_walkthrough']).optional(),
  // ── Answer format ────────────────────────────────────────
  //  'free_text'    — candidate writes/pastes an answer (default)
  //  'multi_select' — candidate ticks `selectCount` of `options`; auto-graded
  //                   against `correctOptions` (correctOptions withheld from candidate)
  answerFormat: z.enum(['free_text', 'multi_select']).optional(),
  options: z.array(z.string().min(1).max(500)).max(40).nullable().optional(),
  correctOptions: z.array(z.string().min(1).max(500)).max(40).nullable().optional(),
  selectCount: z.number().int().positive().max(40).nullable().optional(),
  version: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

// Normalize + validate a multi_select payload so bad pick-list data never
// reaches the DB (and free_text tasks never carry stray option data).
function normalizeTaskInput<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = { ...input };
  if (out.answerFormat === 'multi_select') {
    const options = (out.options ?? []).map((o: string) => o.trim()).filter(Boolean);
    // de-duplicate while preserving order
    const seen = new Set<string>();
    const uniqueOptions = options.filter((o: string) => (seen.has(o) ? false : (seen.add(o), true)));
    if (uniqueOptions.length < 2) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A pick-list task needs at least two options.' });
    }
    const correct = (out.correctOptions ?? [])
      .map((o: string) => o.trim())
      .filter((o: string) => uniqueOptions.includes(o));
    if (correct.length < 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mark at least one option as correct.' });
    }
    let selectCount = out.selectCount ?? correct.length;
    if (selectCount < 1) selectCount = correct.length;
    if (selectCount > uniqueOptions.length) selectCount = uniqueOptions.length;
    out.options = uniqueOptions;
    out.correctOptions = correct;
    out.selectCount = selectCount;
  } else if (out.answerFormat === 'free_text') {
    // free_text carries no pick-list data
    out.options = null;
    out.correctOptions = null;
    out.selectCount = null;
  }
  return out as T;
}

export const assessmentTasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.assessmentTasks.findMany({
      orderBy: [asc(assessmentTasks.title)],
    });
  }),

  create: protectedProcedure
    .input(TaskInput)
    .mutation(async ({ ctx, input }) => {
      const values = normalizeTaskInput(input);
      const [t] = await ctx.db.insert(assessmentTasks)
        .values({ ...values, createdBy: ctx.user.id })
        .returning();
      await auditChange(ctx.db, ctx.user.id, t.id, 'assessment_tasks', 'create');
      return t;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(TaskInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rawUpdates } = input;
      const existing = await ctx.db.query.assessmentTasks.findFirst({ where: eq(assessmentTasks.id, id) });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      const updates = normalizeTaskInput(rawUpdates);
      const [t] = await ctx.db.update(assessmentTasks)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(assessmentTasks.id, id))
        .returning();
      await auditChange(ctx.db, ctx.user.id, id, 'assessment_tasks', 'update');
      return t;
    }),

  // Draft a task from an uploaded file (screenshot / PDF / text). The file
  // was already stored via POST /api/upload/work-sample (uploaded_files table);
  // we look it up by key, read it with AI, and return a DRAFT the recruiter
  // reviews and edits before saving. Nothing is persisted here.
  draftFromUpload: protectedProcedure
    .input(z.object({ key: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user.role;
      if (!role || !['admin', 'sysadmin'].includes(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
      }
      const res = await ctx.db.execute(
        sql`SELECT filename, mime_type, data FROM uploaded_files WHERE key = ${input.key}`,
      );
      const row = (res as any).rows?.[0];
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Uploaded file not found' });
      const mimeType = String(row.mime_type ?? 'application/octet-stream');
      if (!isSupportedUploadType(mimeType)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unsupported file type. Upload an image (PNG/JPG), a PDF, or a text file.',
        });
      }
      return draftTaskFromUpload({
        mimeType,
        base64: String(row.data ?? ''),
        filename: String(row.filename ?? 'upload'),
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(assessmentTasks).where(eq(assessmentTasks.id, input.id));
      await auditChange(ctx.db, ctx.user.id, input.id, 'assessment_tasks', 'delete');
      return { ok: true };
    }),
});
