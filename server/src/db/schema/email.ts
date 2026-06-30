import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Inbound / test emails. Powers the admin SendGrid test inbox now, and is the
// seed table for the real candidate-reply Inbound Parse pipeline later.
export const inboundEmails = pgTable('inbound_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromEmail: varchar('from_email', { length: 320 }).notNull(),
  fromName: varchar('from_name', { length: 255 }),
  toEmail: varchar('to_email', { length: 320 }),
  subject: varchar('subject', { length: 500 }),
  body: text('body'),
  replyTag: varchar('reply_tag', { length: 120 }),       // the +tag parsed from the to-address
  source: varchar('source', { length: 20 }).notNull().default('webhook'), // 'webhook' | 'simulated'
  raw: jsonb('raw'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
