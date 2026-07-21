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
import { getCompanyTalkingPoints, type CompanyTalkingPoints } from './companyTalkingPoints.js';
import { scoreWalkthroughFromTranscript } from './workSampleScoring.js';
import { WALKTHROUGH_ROUND_NAME } from './workSampleWalkthrough.js';
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
  // Standard company talking points shown to every interviewer, every round.
  talkingPoints: CompanyTalkingPoints;
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

  // Resolve the OPENING the candidate is being hired into. A job description can
  // be reused across openings (e.g. a "backfill — same JD" requisition), and in
  // that case the JD still points at its ORIGINAL opening. So gather every
  // requisition tied to this JD — the ones that reuse it (baseJdId) plus the
  // JD's own home requisition — and prefer an Open/Approved one, most recent
  // first. This stops a reused JD from pulling the old opening's rounds instead
  // of the opening the candidate is actually in.
  const byId = new Map<string, any>();
  const reuseReqs = await db.select().from(jobRequisitions)
    .where(eq(jobRequisitions.baseJdId, candidate.jdId));
  for (const r of reuseReqs) byId.set(r.id, r);
  if (jd?.reqId) {
    const home = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) });
    if (home) byId.set(home.id, home);
  }
  const candidateReqs = [...byId.values()];
  if (candidateReqs.length === 0) return existing;
  const statusRank = (st: string | null | undefined) =>
    st === 'Open' ? 3 : st === 'Approved' ? 2 : st === 'Pending Approval' ? 1 : 0;
  candidateReqs.sort((a, b) =>
    statusRank(b.status) - statusRank(a.status) ||
    (new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()));
  const targetReq = candidateReqs[0];

  const plan = await db.select().from(interviewPlan)
    .where(eq(interviewPlan.reqId, targetReq.id))
    .orderBy(asc(interviewPlan.sortOrder));

  let toInsert: Array<{ candidateId: string; roundName: string; interviewerName?: string | null; sortOrder: number }>;
  if (plan.length) {
    // Named rounds defined on that opening's intake.
    toInsert = plan.map((r, i) => ({ candidateId, roundName: r.roundName, interviewerName: (r as any).interviewer ?? null, sortOrder: r.sortOrder ?? i }));
  } else {
    // No named rounds — fall back to that opening's round COUNT (generic "Round 1..N").
    const n = Math.max(1, Math.min(5, ((targetReq as any)?.interviewRounds ?? 1)));
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

  // Live Work Sample Walkthrough: also score the transcript against the role's
  // work-sample rubric and store it as a SUGGESTED (advisory) score for the
  // panel — never advances or rejects.
  if (round.roundName === WALKTHROUGH_ROUND_NAME) {
    await scoreWalkthroughFromTranscript(db, round.candidateId, transcript)
      .catch((err) => console.error('[walkthrough] work-sample scoring failed:', err));
  }

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
  const talkingPoints = await getCompanyTalkingPoints(db);
  return { rounds, followUps, talkingPoints };
}
