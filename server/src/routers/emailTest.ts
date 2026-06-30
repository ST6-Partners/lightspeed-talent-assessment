// ============================================================
// EMAIL TEST ROUTER — admin-only SendGrid send + test inbox
// ============================================================

import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import { requireAdmin } from '../services/permissions.js';
import { inboundEmails } from '../db/schema/email.js';
import { sendEmailOrThrow, emailConfig } from '../services/email.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const emailTestRouter = router({
  // Current SendGrid configuration (key set? from / reply-to addresses)
  config: protectedProcedure.use(requireAdmin).query(() => emailConfig()),

  // Send a test email through SendGrid
  sendTest: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      to: z.string().email(),
      name: z.string().optional(),
      subject: z.string().min(1).default('Test email from Lightspeed Talent Assessment'),
      message: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const greeting = input.name ? `<p>Hi ${escapeHtml(input.name)},</p>` : '';
      const html =
        `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">` +
        `${greeting}<p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>` +
        `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"/>` +
        `<p style="font-size:12px;color:#888">Sent from the Lightspeed Talent Assessment SendGrid test form.</p></div>`;
      try {
        const { sandbox } = await sendEmailOrThrow({ to: input.to, subject: input.subject, html, templateId: 'admin_test' });
        return { ok: true as const, sandbox };
      } catch (err: any) {
        return { ok: false as const, error: err?.message ?? 'Send failed' };
      }
    }),

  // Test inbox — list received/simulated inbound messages
  listInbound: protectedProcedure
    .use(requireAdmin)
    .query(async ({ ctx }) => {
      return ctx.db.select().from(inboundEmails).orderBy(desc(inboundEmails.receivedAt)).limit(50);
    }),

  // Drop a message into the test inbox without needing live mail set up
  simulateInbound: protectedProcedure
    .use(requireAdmin)
    .input(z.object({
      fromEmail: z.string().email(),
      fromName: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(inboundEmails).values({
        fromEmail: input.fromEmail,
        fromName: input.fromName ?? null,
        toEmail: emailConfig().replyTo,
        subject: input.subject ?? '(no subject)',
        body: input.body,
        source: 'simulated',
      }).returning();
      return row;
    }),

  clearInbound: protectedProcedure
    .use(requireAdmin)
    .mutation(async ({ ctx }) => {
      await ctx.db.delete(inboundEmails);
      return { ok: true as const };
    }),
});
