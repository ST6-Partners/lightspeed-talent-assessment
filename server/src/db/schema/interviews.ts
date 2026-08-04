// ============================================================
// CANDIDATE INTERVIEWS (per-round) — migration 0042
//
// Makes interview rounds first-class per candidate. Each row is one
// round (Round 2 panel, Round 3 final, etc.) carrying its own
// interviewer, schedule, transcript, score, and the three feedback
// tracks. `followUps` holds the structured open threads (questions the
// candidate avoided / half-answered / that a later round should ask) so
// they can be compiled forward into the next interviewer's briefing.
//
// Additive: the legacy single-interview columns on `candidates` are
// left intact; this table is the source of truth for multi-round work.
// ============================================================

import { pgTable, uuid, varchar, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { candidates } from './hiring.js';

// followUps shape: { type: 'avoided' | 'half_answered' | 'suggested', text: string }
export const candidateInterviews = pgTable('candidate_interviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateId: uuid('candidate_id')
    .references(() => candidates.id, { onDelete: 'cascade' })
    .notNull(),
  roundName: varchar('round_name', { length: 120 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  // 'planned' | 'scheduled' | 'completed'
  status: varchar('status', { length: 20 }).notNull().default('planned'),
  interviewerName: varchar('interviewer_name', { length: 200 }),
  interviewerEmail: varchar('interviewer_email', { length: 300 }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  // Tokenized link for the candidate to pick a time from the assigned interviewer's
  // submitted availability (interviewerAvailability, collected at intake). Minted the
  // first time this round's scheduling is opened (see startInterviewRoundScheduling).
  bookingToken: varchar('booking_token', { length: 64 }),
  // Counter-proposal path (mirrors the phone-screen flow). When none of the
  // interviewer's offered times work, the candidate proposes their own slots
  // (stored here as {date,start,end,label}[]), the round flips to
  // status 'candidate_proposed', and the round's interviewer gets a tokenized
  // link (interviewerToken) to pick one of these — or to reach out directly.
  candidateProposedSlots: jsonb('candidate_proposed_slots'),
  interviewerToken: varchar('interviewer_token', { length: 64 }),
  transcript: text('transcript'),
  score: integer('score'),
  feedbackHr: text('feedback_hr'),
  feedbackCandidate: text('feedback_candidate'),
  feedbackInterviewer: text('feedback_interviewer'),
  followUps: jsonb('follow_ups').default([]).notNull(),
  prepSentAt: timestamp('prep_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
