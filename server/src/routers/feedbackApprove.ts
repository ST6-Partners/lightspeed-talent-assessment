// ============================================================
// FEEDBACK APPROVE ROUTER — PM review actions (Signal parity, DD-450)
//
// The human approval workflow for agent-diagnosed items sitting in
// `pm_review`. Mirrors Signal's PUT /:id/approve, /:id/dismiss,
// /:id/reopen-from-review (server/routes/feedback.js). Admin/sysadmin
// only. The admin approval cockpit's Approve / Dismiss / Re-open buttons
// call these.
//
// Parity notes:
//   approve  -> status 'approved'      (records aq_approved + confidence→priority)
//   dismiss  -> status 'wont_fix'      (records pm_dismissed + dismiss note)
//   reopen   -> status 'open'          (clears the agent diagnosis, re-queues)
// ============================================================

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { feedback } from '../db/schema/feedback.js';
import { requireAdmin } from '../services/permissions.js';

function parseAdmin(notes: unknown): Record<string, any> {
  if (!notes) return {};
  if (typeof notes === 'object') return notes as Record<string, any>;
  try { return JSON.parse(notes as string); } catch { return {}; }
}

async function requirePmReview(ctx: any, id: string) {
  const item = await ctx.db.query.feedback.findFirst({ where: eq(feedback.id, id) });
  if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Feedback not found' });
  if (item.status !== 'pm_review') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Item status is '${item.status}' — must be 'pm_review'` });
  }
  return item;
}

export const feedbackApproveRouter = router({
  // PM approves the agent's proposed fix → 'approved'.
  approve: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const item = await requirePmReview(ctx, input.id);
      const adminData = parseAdmin(item.adminNotes);
      const confidence = adminData?.confidence?.total ?? 0;
      const priority = confidence >= 10 ? 'high' : confidence >= 7 ? 'medium' : 'low';
      adminData.aq_approved = true;
      adminData.approved_at = new Date().toISOString();
      adminData.approved_by = ctx.user!.id;
      adminData.aq_priority = priority;

      const [updated] = await ctx.db.update(feedback)
        .set({
          status: 'approved',
          resolvedByType: 'pm_approved',
          adminNotes: JSON.stringify(adminData),
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, input.id))
        .returning();
      return { success: true, item: updated, priority };
    }),

  // PM dismisses → 'wont_fix' (with an optional note).
  dismiss: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const item = await requirePmReview(ctx, input.id);
      const adminData = parseAdmin(item.adminNotes);
      adminData.pm_dismissed = true;
      adminData.dismiss_note = input.note ?? null;
      adminData.dismissed_at = new Date().toISOString();

      const [updated] = await ctx.db.update(feedback)
        .set({
          status: 'wont_fix',
          resolvedByType: 'pm_dismissed',
          adminNotes: JSON.stringify(adminData),
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, input.id))
        .returning();
      return { success: true, item: updated };
    }),

  // PM re-opens → 'open' and clears the agent diagnosis so it can be re-attempted.
  reopenFromReview: protectedProcedure
    .use(requireAdmin)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requirePmReview(ctx, input.id);
      const [updated] = await ctx.db.update(feedback)
        .set({
          status: 'open',
          resolvedByType: 'human',
          adminNotes: null,
          agentRunId: null,
          agentStatus: null,
          agentDiagnosis: null,
          agentPrUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(feedback.id, input.id))
        .returning();
      return { success: true, item: updated };
    }),
});
