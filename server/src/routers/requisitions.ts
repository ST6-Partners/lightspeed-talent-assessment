// ============================================================
// REQUISITIONS ROUTER — CRUD for job_requisitions
// ============================================================

import { z } from 'zod';
import { eq, desc, isNull, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { jobRequisitions, jobDescriptions, candidates } from '../db/schema/hiring.js';
import { inboundEmails } from '../db/schema/email.js';
import { emailReqStatusToCandidate } from '../services/email.js';
import { auditChange } from '../services/audit.js';
import { trackActivity } from '../services/telemetry.js';

const RequisitionInput = z.object({
  department: z.string().min(1).max(200),
  hiringManager: z.string().min(1).max(200),
  numOpenings: z.number().int().min(1).default(1),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship']).default('Full-Time'),
  location: z.string().max(200).optional(),
  remote: z.boolean().default(false),
  targetStartDate: z.string().datetime().optional(),
  salaryMin: z.number().int().optional(),
  salaryMax: z.number().int().optional(),
  reason: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
});

export const requisitionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.jobRequisitions.findMany({
        orderBy: desc(jobRequisitions.createdAt),
      });
      if (input?.status) return rows.filter((r) => r.status === input.status);
      return rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const req = await ctx.db.query.jobRequisitions.findFirst({
        where: eq(jobRequisitions.id, input.id),
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND' });
      return req;
    }),

  create: protectedProcedure
    .input(RequisitionInput)
    .mutation(async ({ ctx, input }) => {
      const [req] = await ctx.db.insert(jobRequisitions).values({
        ...input,
        targetStartDate: input.targetStartDate ? new Date(input.targetStartDate) : undefined,
        createdBy: ctx.user.id,
      }).returning();

      await auditChange(ctx.db, ctx.user.id, req.id, 'job_requisitions', 'create');
      trackActivity(ctx.db, ctx.user.id, 'create_requisition', 'job_requisitions', { reqId: req.id }).catch(() => {});
      return req;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['Draft', 'Pending Approval', 'Approved', 'Open', 'On Hold', 'Closed']).optional(),
    }).merge(RequisitionInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jobRequisitions.findFirst({
        where: eq(jobRequisitions.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...updates } = input;
      const [req] = await ctx.db.update(jobRequisitions)
        .set({
          ...updates,
          targetStartDate: updates.targetStartDate ? new Date(updates.targetStartDate) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(jobRequisitions.id, id))
        .returning();

      // Requisition closed or put on hold → notify active candidates (courtesy).
      if ((input.status === 'Closed' || input.status === 'On Hold') && existing.status !== input.status) {
        const jds = await ctx.db.query.jobDescriptions.findMany({ where: eq(jobDescriptions.reqId, id) });
        const jdIds = jds.map((j: any) => j.id);
        if (jdIds.length) {
          const cands = await ctx.db.query.candidates.findMany({ where: inArray(candidates.jdId, jdIds) });
          const active = cands.filter((c: any) => c.currentStage !== 'Rejected' && c.currentStage !== 'Hired');
          const onHold = input.status === 'On Hold';
          for (const c of active) {
            const jd = jds.find((j: any) => j.id === c.jdId);
            const jobTitle = jd?.jobTitle ?? undefined;
            try {
              await emailReqStatusToCandidate({ firstName: c.firstName, lastName: c.lastName, email: c.email, jobTitle, onHold });
              await ctx.db.insert(inboundEmails).values({
                fromEmail: process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com', fromName: 'Lightspeed Hiring',
                toEmail: c.email,
                subject: onHold ? `Update on the ${jobTitle ?? 'role'} at Lightspeed Systems` : `Update on your application — ${jobTitle ?? 'Lightspeed Systems'}`,
                body: onHold ? 'The role you are being considered for has been placed on hold; your application remains active.' : 'This position has been closed; we will not be moving forward with hiring for it at this time.',
                replyTag: onHold ? 'req_on_hold' : 'req_closed', source: 'simulated', raw: { kind: onHold ? 'req_on_hold' : 'req_closed', reqId: id, candidateId: c.id },
              });
            } catch (err) { console.error('[requisition] candidate status-notify failed:', err); }
          }
        }
      }

      await auditChange(ctx.db, ctx.user.id, id, 'job_requisitions', 'update');
      trackActivity(ctx.db, ctx.user.id, 'update_requisition', 'job_requisitions', { reqId: id }).catch(() => {});
      return req;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jobRequisitions.findFirst({
        where: eq(jobRequisitions.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      // FK: job_descriptions.req_id ON DELETE CASCADE removes child JDs;
      // candidates.jd_id ON DELETE SET NULL detaches any linked candidates.
      await ctx.db.delete(jobRequisitions).where(eq(jobRequisitions.id, input.id));

      await auditChange(ctx.db, ctx.user.id, input.id, 'job_requisitions', 'delete');
      trackActivity(ctx.db, ctx.user.id, 'delete_requisition', 'job_requisitions', { reqId: input.id }).catch(() => {});
      return { id: input.id };
    }),
});
