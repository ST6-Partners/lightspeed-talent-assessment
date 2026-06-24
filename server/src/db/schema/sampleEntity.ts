// ============================================================
// SAMPLE DOMAIN ENTITY — full-stack wiring reference (DD-006, DD-015)
// Adopters rename 'sampleEntities' to their domain (project, ticket, etc.)
// and extend the fields. This demonstrates the complete entity lifecycle:
// Drizzle schema → tRPC router → change log → permissions → Claude tools
// ============================================================

import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './core.js';

export const sampleEntities = pgTable('sample_entities', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Core fields — adopter renames/extends these
  name: varchar('name', { length: 500 }).notNull(),
  description: text('description'),
  entityType: varchar('entity_type', { length: 50 }).notNull().default('default'),
  status: varchar('status', { length: 20 }).notNull().default('active'),

  // Ownership (RCDO pattern: owner_id → users)
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

  // Soft delete (RCDO pattern: archived_at + archived_by)
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedBy: uuid('archived_by').references(() => users.id),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
