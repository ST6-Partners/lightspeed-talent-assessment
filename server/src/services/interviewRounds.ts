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
import { candidates, candidateStageHistory, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { interviewPlan } from '../db/schema/intake.js';
import { getCompanyTalkingPoints, type CompanyTalkingPoints } from './companyTalkingPoints.js';
import { scoreWalkthroughFromTranscript } from './workSampleScoring.js';
import { WALKTHROUGH_ROUND_NAME } from './workSampleWalkthrough.js';
import { logDecision } from './decisionLog.js';
import { emailInterviewRoundPrep, emailInterviewScheduledHR, emailInterviewCompletedHR } from './email.js';
import { enterWorkSampleStage } from './workSampleEntry.js';
import {
  analyzeInterviewTranscript,
  synthesizeInterviewTranscript,
  type InterviewFollowUp,
} from './ai.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

/** Notify the hiring team that the candidate self-booked their interview, with a
 *  per-round list linking each round to the candidate's page (where its
 *  pre-interview briefing lives). Fired from the Calendly booking flow. */
export async function sendInterviewScheduledTeamEmail(candidateId: string): Promise<boolean> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return false;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  await seedRoundsFromPlan(candidateId).catch((err) => console.error('[interview-rounds] seed for scheduled email failed:', err));
  const rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  const fmt = (d: any) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  await emailInterviewScheduledHR({
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: jd?.jobTitle ?? undefined,
    rounds: rounds.map((r) => ({
      roundName: r.roundName,
      interviewerName: r.interviewerName ?? null,
      when: r.scheduledAt ? fmt(r.scheduledAt) : null,
    })),
  });
  return true;
}

/** Send THIS round's completed feedback (from the transcript) to the round's own
 *  interviewer — not the hiring team. Fired when the round's scorecard is submitted
 *  (values.saveReview). The NEXT round's interviewer gets their briefing separately
 *  via sendNextRoundPrep, so this email is just the feedback for the round they ran.
 *  No-op if the round has no interviewer email. */
export async function sendInterviewCompletedTeamEmail(roundId: string): Promise<boolean> {
  const round = await db.query.candidateInterviews.findFirst({ where: eq(candidateInterviews.id, roundId) });
  if (!round) return false;
  if (!round.interviewerEmail) {
    console.warn(`[interview-rounds] round ${roundId} completed but has no interviewer email — feedback email skipped`);
    return false;
  }
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, round.candidateId) });
  if (!candidate) return false;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  await emailInterviewCompletedHR({
    to: round.interviewerEmail,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: jd?.jobTitle ?? undefined,
    roundName: round.roundName,
    interviewScore: (round.score as number | null) ?? null,
    feedback: (round.feedbackHr as string | null) ?? null,
    // No candidate link and no next-round briefing here — the next interviewer is
    // briefed separately (sendNextRoundPrep); this is just the interviewer's own read.
    candidateUrl: undefined,
    nextRound: null,
    nextBriefing: null,
  });
  return true;
}

// ── Prep-email automation ──────────────────────────────────
// The interviewer prep email (with the cross-round briefing) sends
// AUTOMATICALLY: round 1 when the interview is scheduled, and each later round
// when the PRIOR round's scorecard is submitted. These helpers do the send;
// the triggers live in the interviews + values routers and the Calendly flow.
// Idempotent per round via prepSentAt.

/** Email one round's interviewer their prep + cross-round briefing. No-op if the
 *  round is missing, has no interviewer email, or was already sent (unless forced). */
export async function sendRoundPrep(roundId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const round = await db.query.candidateInterviews.findFirst({ where: eq(candidateInterviews.id, roundId) });
  if (!round || !round.interviewerEmail) return false;
  if (!opts.force && round.prepSentAt) return false;
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, round.candidateId) });
  if (!candidate) return false;
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const briefing = await buildPriorRoundsBriefing(round.candidateId, round.sortOrder);
  await emailInterviewRoundPrep({
    to: round.interviewerEmail,
    interviewerName: round.interviewerName,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    jobTitle: jd?.jobTitle ?? undefined,
    roundName: round.roundName,
    questions: ((candidate as any).interviewQuestions ?? []) as any,
    briefing,
  });
  await db.update(candidateInterviews).set({ prepSentAt: new Date(), updatedAt: new Date() })
    .where(eq(candidateInterviews.id, roundId));
  return true;
}

/** Send prep for a candidate's FIRST round (lowest sortOrder) — used when the
 *  interview is first scheduled. */
export async function sendFirstRoundPrep(candidateId: string): Promise<boolean> {
  const rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  if (!rounds.length) return false;
  return sendRoundPrep(rounds[0].id);
}

/** Send prep for the round immediately after `afterSortOrder` — used when a
 *  round's scorecard is submitted, so the NEXT interviewer is briefed. */
export async function sendNextRoundPrep(candidateId: string, afterSortOrder: number): Promise<boolean> {
  const rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId))
    .orderBy(asc(candidateInterviews.sortOrder));
  const next = rounds.find((r: any) => r.sortOrder > afterSortOrder);
  if (!next) return false;
  return sendRoundPrep(next.id);
}

// Stages the candidate can be auto-advanced FROM when every round wraps up.
// Anyone already further along (Work Sample, Reference Check, Offered,
// Rejected, ...) is left alone -- this only fires once, for whoever is still
// sitting in the interview phase when the last round completes.
const INTERVIEW_PHASE_STAGES = ['Interview Scheduled', 'Interviewed'];

/**
 * Called after ANY round's status flips to 'completed' (AI feedback or a
 * manual status edit). If every round for this candidate is now completed,
 * marks the interview done and auto-advances the candidate to the next stage.
 *
 * Work Sample sits AFTER the interview and is OPT-IN per role via
 * jd.workSampleRequired (the same flag the candidate-facing work-sample flow
 * treats as authoritative). So:
 *   • role uses a work sample -> advance to Work Sample AND run the same entry
 *     side effects the manual advance does (mint the take-home /work-sample
 *     link + invite email, or seed a live-walkthrough round). The candidate
 *     then waits in Work Sample for human review, exactly like the manual path.
 *   • role has no work sample -> skip straight to Reference Check (as before),
 *     so no phantom Work Sample hop shows in the candidate's stage history.
 *
 * No-op if there are no rounds yet, not all rounds are done, or the candidate
 * has already moved past the interview phase.
 */
export async function maybeAdvanceOnAllRoundsComplete(
  candidateId: string,
  changedBy: string | null = null,
): Promise<void> {
  const rounds = await db.select().from(candidateInterviews)
    .where(eq(candidateInterviews.candidateId, candidateId));
  if (rounds.length === 0) return;
  if (!rounds.every((r) => r.status === 'completed')) return;

  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate || !INTERVIEW_PHASE_STAGES.includes(candidate.currentStage)) return;

  // Does this candidate's role use a work sample? Gate on the JD flag, the same
  // signal workSample.infoForJd / the intake form use for `required`.
  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const usesWorkSample = (jd as any)?.workSampleRequired === true;
  const toStage = usesWorkSample ? 'Work Sample' : 'Reference Check';

  const fromStage = candidate.currentStage;
  await db.update(candidates)
    .set({ currentStage: toStage, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  await db.insert(candidateStageHistory).values({
    candidateId,
    fromStage,
    toStage,
    changedBy,
    reason: usesWorkSample
      ? `Interview marked complete — all ${rounds.length} round(s) done, auto-advanced to Work Sample`
      : `Interview marked complete — all ${rounds.length} round(s) done, no work sample for this role, auto-advanced to Reference Check`,
  });

  await logDecision(db, {
    candidateId,
    decisionType: 'manual_stage_change',
    outcome: 'advanced',
    decidedByType: 'deterministic',
    decidedBy: changedBy,
    reason: usesWorkSample
      ? `All ${rounds.length} interview round(s) completed; role requires a work sample`
      : `All ${rounds.length} interview round(s) completed; role has no work sample`,
    inputs: { fromStage, toStage, roundCount: rounds.length, workSampleRequired: usesWorkSample },
  });

  // Work Sample entry side effects (take-home link + invite email, or live
  // walkthrough round) — mirrors the manual advance. Only when routing INTO
  // Work Sample; Reference Check has no candidate-facing entry email.
  if (usesWorkSample) {
    await enterWorkSampleStage(db, candidateId, fromStage)
      .catch((err) => console.error('[interview-rounds] work-sample entry side effects failed:', err));
  }
}

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

  let toInsert: Array<{ candidateId: string; roundName: string; interviewerName?: string | null; interviewerEmail?: string | null; sortOrder: number }>;
  if (plan.length) {
    // Named rounds defined on that opening's intake. Carry the plan's
    // interviewer EMAIL through too — it's the key the candidate scheduler uses
    // to look up each round's availability, so without it rounds 2..N would show
    // no times to pick from.
    toInsert = plan.map((r, i) => ({ candidateId, roundName: r.roundName, interviewerName: (r as any).interviewer ?? null, interviewerEmail: (r as any).interviewerEmail ?? null, sortOrder: r.sortOrder ?? i }));
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
    updatedAt: new Date(),
  }).where(eq(candidateInterviews.id, roundId));

  // Live Work Sample Walkthrough: also score the transcript against the role's
  // work-sample rubric and store it as a SUGGESTED (advisory) score for the
  // panel — never advances or rejects.
  if (round.roundName === WALKTHROUGH_ROUND_NAME) {
    await scoreWalkthroughFromTranscript(db, round.candidateId, transcript)
      .catch((err) => console.error('[walkthrough] work-sample scoring failed:', err));
  }

  // NOTE: generating the transcript does NOT close the round. The round closes
  // only when its scorecard is submitted (values.saveReview) — that submit is what
  // marks the round complete, fires the completed-team email (this round's feedback
  // + next-round briefing) and the next round's interviewer prep, and runs the
  // all-rounds-complete advance. Here we only store the transcript + AI feedback so
  // it's ready for the scorecard.

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
