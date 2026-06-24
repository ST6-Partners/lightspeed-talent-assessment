// ============================================================
// AI & PROMPT TABLES — prompt templates, knowledge, FAQ, attachments
// (SC-001, SC-005, DD-009)
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core';
import { users } from './core.js';

export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull(),
    // e.g., 'chat.system', 'feedback.review', 'batch.generation'
  version: integer('version').notNull().default(1),
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const designKnowledge = pgTable('design_knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).notNull(),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const faqEntries = pgTable('faq_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  keywords: text('keywords'), // Comma-separated for simple search
  category: varchar('category', { length: 100 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chatAttachments = pgTable('chat_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatSessionId: varchar('chat_session_id', { length: 100 }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  fileData: text('file_data'), // Base64 encoded
  mimeType: varchar('mime_type', { length: 100 }),
  filename: varchar('filename', { length: 255 }),
  extractedText: text('extracted_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
