// ============================================================
// INSIGHTS DISCOVERY SCHEMA
// Stores an uploaded Insights Discovery profile PDF plus the
// Colour Dynamics data parsed from it. The PDF bytes live in
// Postgres (pdf_data bytea) so this works on any host (Railway
// has no object storage). Each profile is linked to a candidate.
// Post-hire reference only - NOT a screening gate.
// ============================================================

import {
  pgTable, uuid, varchar, text, integer, jsonb, timestamp, customType,
} from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';
import { users } from './core.js';

// Raw binary column (Postgres bytea <-> Node Buffer).
const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea'; },
});

export interface ColourEnergies {
  blue: number;   green: number;   yellow: number;   red: number;
  bluePct: number; greenPct: number; yellowPct: number; redPct: number;
}

export const insightsDiscoveryProfiles = pgTable('insights_discovery_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),

  // Stored PDF: bytes in the DB. pdfKey kept (nullable) for legacy/object-storage compatibility.
  pdfKey: text('pdf_key'),
  pdfData: bytea('pdf_data'),
  pdfFilename: varchar('pdf_filename', { length: 300 }),

  typeNumber: integer('type_number'),
  typeName: varchar('type_name', { length: 200 }),
  lcTypeNumber: integer('lc_type_number'),
  lcTypeName: varchar('lc_type_name', { length: 200 }),

  conscious: jsonb('conscious').$type<ColourEnergies | null>(),
  lessConscious: jsonb('less_conscious').$type<ColourEnergies | null>(),

  parseStatus: varchar('parse_status', { length: 20 }).notNull().default('ok'),
  parseError: text('parse_error'),

  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
