// ============================================================
// INTERVIEW ROUNDS SERVICE (per-candidate, multi-round)
//
//  • seedRoundsFromPlan  — create per-round records from the req's
//    interview plan (best-effort; no-op if a plan can't be resolved).
//  • generateRoundFeedback — transcript → AI feedback for ONE round,
//    stored on that round (incl. structured follow-ups).
//  • buildPriorRoundsBriefing — compile what the NEXT interviewer sees:
//    each earlier completed round's written read on the candidate
//    (numeric score HIDDEN) + a consolidated follow-up list. The
//    interviewer-coaching notes are deliberately excluded.
// ============================================================

import { eq, and, lt, asc } from 'drizzle-orm';
import { db } from '../db.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { candidates, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { interviewPlan } from '../db/schema/intake.js';
import {
  analyzeInterviewTranscript,
  synthesizeInterviewTranscript,
  type InterviewFollowUp,
} from './ai.js';

export interface BriefingRound {
  roundName: string;
  interviewerName: string | null;
  writtenRead: string; // feedbackHr — the read on the CANDIDATE. Score omitted on purpose.
}
export interface BriefingFollowUp extends InterviewFollowUp {
  roundName: string;
}
export interface PriorRoundsBriefing {
  rounds: BriefingRound[];
  followUps: BriefingFollowUp[];
}

/** Create per-round records from the requisition's interview plan.
 *  Idempotent: if the candidate already has rounds, returns them. */
export async function seedRoundsFromPlan(candidateId: string) {
  const existing = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  if (existing.length) return existing;

  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate?.jdId) return existing;
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) });
  if (!jd?.reqId) return existing;

  const plan = await db.select().from(interviewPlan)
    .where(eq(interviewPlan.reqId, jd.reqId))
    .orderBy(asc(interviewPlan.sortOrder));

  let toInsert: Array<{ candidateId: string; roundName: string; interviewerName?: string | null; sortOrder: number }>;
  if (plan.length) {
    // Named rounds defined on the role's intake.
    toInsert = plan.map((r, i) => ({ candidateId, roundName: r.roundName, interviewerName: (r as any).interviewer ?? null, sortOrder: r.sortOrder ?? i }));
  } else {
    // No named rounds — fall back to the requisition's round COUNT so rounds
    // still appear (generic "Round 1..N"). Only skip if we truly can't tell.
    const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) });
    const n = Math.max(1, Math.min(5, ((req as any)?.interviewRounds ?? 1)));
    toInsert = Array.from({ length: n }, (_, i) => ({ candidateId, roundName: `Round ${i + 1}`, sortOrder: i }));
  }

  await db.insert(candidateInterviews).values(toInsert);
  return db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
}

/**
 * Testing helper: whether to auto-populate sample interview transcripts.
 * Explicit override via SAMPLE_INTERVIEW_TRANSCRIPTS (1/0, true/false, on/off).
 * Default: ON while there's no ANTHROPIC_API_KEY (i.e. the demo/testing posture),
 * and OFF once real AI is configured — so production with real Zoom transcripts
 * is never seeded with fake data.
 */
export function sampleTranscriptsEnabled(): boolean {
  const v = (process.env.SAMPLE_INTERVIEW_TRANSCRIPTS ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return !process.env.ANTHROPIC_API_KEY;
}

/**
 * Auto-fill sample interview data for a candidate (testing only). Seeds the
 * per-round records (falling back to a single generic round if the role has no
 * plan), then generates a sample transcript + feedback for any round that
 * doesn't have feedback yet. No-op unless sampleTranscriptsEnabled().
 */
export async function autofillSampleRounds(candidateId: string): Promise<void> {
  if (!sampleTranscriptsEnabled()) return;
  await seedRoundsFromPlan(candidateId).catch((err) => console.error('[autofill] seed rounds failed:', err));
  let rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  if (rounds.length === 0) {
    await db.insert(candidateInterviews).values({ candidateId, roundName: 'Interview', sortOrder: 0 });
    rounds = await db.select().from(candidateInterviews)
      .where(eq(candidateInterviews.candidateId, candidateId))
      .orderBy(asc(candidateInterviews.sortOrder));
  }
  for (const r of rounds) {
    if (((r.feedbackHr as string | null) ?? '').trim()) continue; // already has feedback — leave it
    await generateRoundFeedback(r.id).catch((err) => console.error('[autofill] round feedback failed', r.id, err));
  }
}

/** Run AI feedback for a single round and store it on that round. */
export async function generateRoundFeedback(roundId: string, transcriptIn?: string | null) {
  const round = (await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.id, roundId)).limit(1))[0];
  if (!round) throw new Error(`Interview round not found: ${roundId}`);

  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, round.candidateId) });
  if (!candidate) throw new Error(`Candidate not found: ${round.candidateId}`);
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle = jd?.jobTitle ?? undefined;

  const provided = (transcriptIn ?? '').trim();
  const stored = ((round.transcript as string | null) ?? '').trim();
  let transcript: string;
  if (provided) transcript = provided;
  else if (stored) transcript = stored;
  else transcript = await synthesizeInterviewTranscript({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle,
    interviewerName: round.interviewerName,
    interviewQuestions: (candidate as any).interviewQuestions ?? null,
  });

  const feedback = await analyzeInterviewTranscript({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle,
    transcript,
    interviewQuestions: (candidate as any).interviewQuestions ?? null,
    ccatScore: candidate.ccatScore,
    eppValuesMatchScore: candidate.eppValuesMatchScore,
    workSampleScore: candidate.workSampleScore,
    resumeReviewScore: candidate.resumeReviewScore,
    referenceCheckScore: (candidate as any).referenceCheckScore,
  });

  await db.update(candidateInterviews).set({
    transcript,
    score: feedback.interviewScore,
    feedbackHr: feedback.feedbackHr,
    feedbackCandidate: feedback.feedbackCandidate,
    feedbackInterviewer: feedback.feedbackInterviewer,
    followUps: feedback.followUps,
    status: 'completed',
    updatedAt: new Date(),
  }).where(eq(candidateInterviews.id, roundId));

  return { roundId, transcript, feedback };
}

/** Compile the briefing the interviewer for `beforeSortOrder` should get:
 *  earlier COMPLETED rounds' written read on the candidate (no score) +
 *  the consolidated follow-up list. Coaching notes are NOT included. */
export async function buildPriorRoundsBriefing(
  candidateId: string,
  beforeSortOrder: number,
): Promise<PriorRoundsBriefing> {
  const prior = await db.select().from(candidateInterviews)
    .where(and(
      eq(candidateInterviews.candidateId, candidateId),
      lt(candidateInterviews.sortOrder, beforeSortOrder),
      eq(candidateInterviews.status, 'completed'),
    ))
    .orderBy(asc(candidateInterviews.sortOrder));

  const rounds: BriefingRound[] = [];
  const followUps: BriefingFollowUp[] = [];
  for (const r of prior) {
    if (r.feedbackHr) {
      rounds.push({ roundName: r.roundName, interviewerName: r.interviewerName ?? null, writtenRead: r.feedbackHr });
    }
    const fus = Array.isArray(r.followUps) ? (r.followUps as InterviewFollowUp[]) : [];
    for (const f of fus) {
      if (f && f.text) followUps.push({ roundName: r.roundName, type: f.type, text: f.text });
    }
  }
  return { rounds, followUps };
}
