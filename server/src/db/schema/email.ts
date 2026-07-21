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

// Outbound email capture ("test inbox" for sent mail). Every email the app
// dispatches is recorded here with its full rendered body so the whole
// automated-email set can be reviewed without a live SendGrid key. No FK to
// candidates — rows persist even after a candidate is deleted.
export const sentEmails = pgTable('sent_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipient: varchar('recipient', { length: 600 }).notNull(),
  subject: varchar('subject', { length: 500 }),
  template: varchar('template', { length: 120 }),
  body: text('body'),
  status: varchar('status', { length: 20 }).notNull().default('sandbox'), // sandbox | sent | failed | suppressed
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
