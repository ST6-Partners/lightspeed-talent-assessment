// ============================================================
// INTERVIEW FEEDBACK SERVICE
//
// Shared pipeline: interview transcript → AI feedback (candidate,
// hiring-manager, and interviewer coaching) → store on candidate →
// email HR + interviewer.
//
// Used by BOTH:
//   • the Zoom recording webhook (real transcript pulled from Zoom), and
//   • the manual "Process interview" action in the app (paste a
//     transcript, or — when Zoom isn't connected — auto-generate a
//     realistic sample transcript so the whole flow is demoable).
// ============================================================

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { candidates, candidateStageHistory, jobDescriptions } from '../db/schema/hiring.js';
import { analyzeInterviewTranscript, synthesizeInterviewTranscript, type InterviewFeedback } from './ai.js';
import { emailInterviewFeedbackInterviewer } from './email.js';
import { logDecision } from './decisionLog.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

export interface ProcessInterviewInput {
  candidateId: string;
  /** Optional explicit transcript. If omitted, uses the stored transcript,
   *  else synthesizes a realistic sample (no-Zoom demo path). */
  transcript?: string | null;
  changedBy?: string | null;
  sendEmails?: boolean;
}

export interface ProcessInterviewResult {
  candidateId: string;
  transcript: string;
  transcriptSource: 'provided' | 'stored' | 'generated';
  feedback: InterviewFeedback;
  emailedInterviewer: boolean;
}

export async function processInterviewFeedback(input: ProcessInterviewInput): Promise<ProcessInterviewResult> {
  const sendEmails = input.sendEmails ?? true;

  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, input.candidateId),
  });
  if (!candidate) throw new Error(`Candidate not found: ${input.candidateId}`);

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle = jd?.jobTitle ?? undefined;

  // ── Resolve the transcript ────────────────────────────────
  let transcript: string;
  let transcriptSource: ProcessInterviewResult['transcriptSource'];
  const provided = (input.transcript ?? '').trim();
  const stored = ((candidate as any).interviewTranscript ?? '').trim();
  if (provided) {
    transcript = provided;
    transcriptSource = 'provided';
  } else if (stored) {
    transcript = stored;
    transcriptSource = 'stored';
  } else {
    transcript = await synthesizeInterviewTranscript({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      jobTitle,
      interviewerName: (candidate as any).interviewerName,
      interviewQuestions: (candidate as any).interviewQuestions ?? null,
    });
    transcriptSource = 'generated';
  }

  // Persist the transcript.
  await db.update(candidates)
    .set({ interviewTranscript: transcript, updatedAt: new Date() })
    .where(eq(candidates.id, candidate.id));

  // Advance Interview Scheduled → Interviewed (only if needed).
  if (candidate.currentStage === 'Interview Scheduled') {
    await db.update(candidates)
      .set({ currentStage: 'Interviewed', updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id));
    await db.insert(candidateStageHistory).values({
      candidateId: candidate.id,
      fromStage: 'Interview Scheduled',
      toStage: 'Interviewed',
      changedBy: input.changedBy ?? null,
      reason: 'Interview transcript processed — auto-advanced',
    });
  }

  // ── Run the AI analysis ───────────────────────────────────
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

  await db.update(candidates)
    .set({
      interviewFeedbackHr: feedback.feedbackHr,
      interviewFeedbackCandidate: feedback.feedbackCandidate,
      interviewFeedbackInterviewer: feedback.feedbackInterviewer,
      interviewScore: feedback.interviewScore,
      updatedAt: new Date(),
    } as any)
    .where(eq(candidates.id, candidate.id));

  // Phase 2 — record the interview-feedback analysis with AI provenance.
  // This is advisory (never an automated reject), so outcome is 'scored'.
  await logDecision(db, {
    candidateId: candidate.id,
    decisionType: 'interview_feedback',
    outcome: 'scored',
    score: feedback.interviewScore,
    decidedByType: 'ai',
    decidedBy: input.changedBy ?? null,
    model: feedback.provenance?.model ?? null,
    requestedModel: feedback.provenance?.requestedModel ?? null,
    promptId: feedback.provenance?.promptId ?? null,
    promptVersion: feedback.provenance?.promptVersion ?? null,
    reason: `Interview analyzed: score ${feedback.interviewScore}/100 (advisory; informs the human scorecard, not an automated decision).`,
    inputs: { interviewScore: feedback.interviewScore, transcriptSource },
  });

  // ── Emails ────────────────────────────────────────────────
  let emailedInterviewer = false;

  // Only the interviewer is emailed the debrief. HR feedback is still
  // generated and stored on the candidate (visible in-app) but not emailed.
  if (sendEmails) {
    const interviewerEmail = (candidate as any).interviewerEmail;
    if (interviewerEmail) {
      const base = appBaseUrl();
      try {
        await emailInterviewFeedbackInterviewer({
          to: interviewerEmail,
          interviewerName: (candidate as any).interviewerName,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          jobTitle,
          feedbackInterviewer: feedback.feedbackInterviewer,
          appUrl: base ? `${base}/hiring/candidates?id=${candidate.id}` : undefined,
        });
        emailedInterviewer = true;
      } catch (err) {
        console.error('[interviewFeedback] interviewer debrief email failed:', err);
      }
    }
  }

  console.log(`[interviewFeedback] ${candidate.firstName} ${candidate.lastName} — score ${feedback.interviewScore}, transcript=${transcriptSource}, interviewer=${emailedInterviewer}`);

  return { candidateId: candidate.id, transcript, transcriptSource, feedback, emailedInterviewer };
}
