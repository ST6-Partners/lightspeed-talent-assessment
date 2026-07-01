// ============================================================
// INSIGHTS DISCOVERY SCHEMA
// Stores an uploaded Insights Discovery profile PDF (in object
// storage) plus the Colour Dynamics data parsed from it:
// conscious + less-conscious colour energies (Blue/Green/Yellow/
// Red, raw 0-6 + percent) and the 72-type wheel positions.
// Each profile is linked to one candidate. Post-hire reference
// only - NOT a screening gate (per module design decisions).
// ============================================================

import {
  pgTable, uuid, varchar, text, integer, jsonb, timestamp,
} from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';
import { users } from './core.js';

// Shape stored in the `conscious` / `less_conscious` jsonb columns.
export interface ColourEnergies {
  blue: number;   green: number;   yellow: number;   red: number;   // raw, 0-6 scale
  bluePct: number; greenPct: number; yellowPct: number; redPct: number; // 0-100
}

export const insightsDiscoveryProfiles = pgTable('insights_discovery_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),

  // Stored PDF (Replit Object Storage key; served via /api/files/<key>)
  pdfKey: text('pdf_key').notNull(),
  pdfFilename: varchar('pdf_filename', { length: 300 }),

  // 72-type wheel positions
  typeNumber: integer('type_number'),                       // e.g. 55
  typeName: varchar('type_name', { length: 200 }),          // e.g. "Reforming Observer (Accommodating)"
  lcTypeNumber: integer('lc_type_number'),                  // less-conscious, e.g. 15
  lcTypeName: varchar('lc_type_name', { length: 200 }),

  // Colour Dynamics energies (jsonb: ColourEnergies shape)
  conscious: jsonb('conscious').$type<ColourEnergies | null>(),
  lessConscious: jsonb('less_conscious').$type<ColourEnergies | null>(),

  // Parse bookkeeping - lets the UI flag a PDF we could not read
  parseStatus: varchar('parse_status', { length: 20 }).notNull().default('ok'), // 'ok' | 'partial' | 'failed'
  parseError: text('parse_error'),

  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
