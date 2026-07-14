// ============================================================
// AI SERVICE — Interview question generation + post-interview
// feedback analysis using Claude (Anthropic API).
//
// SANDBOX MODE: when ANTHROPIC_API_KEY is not set, all calls
// log to console and return mock data. No real API calls.
// ============================================================

import { PROMPTS } from './prompts.js';

const SANDBOX = !process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const MODEL = 'claude-3-5-sonnet-20241022';

const LIGHTSPEED_VALUES = [
  'Integrity', 'Accountability', 'Collaboration', 'Innovation',
  'Customer Focus', 'Excellence', 'Respect', 'Transparency',
  'Adaptability', 'Ownership', 'Empathy', 'Drive', 'Impact',
];

// ── Types ──────────────────────────────────────────────────

export interface InterviewQuestion {
  category: string;
  question: string;
  rationale: string;
}

export interface InterviewFollowUp {
  // 'avoided'      — a question the candidate dodged / did not answer
  // 'half_answered'— answered partially; needs more depth next round
  // 'suggested'    — a topic a later round should probe
  type: 'avoided' | 'half_answered' | 'suggested';
  text: string;
}

export interface InterviewFeedback {
  interviewScore: number;          // 0–100
  feedbackHr: string;              // full report for hiring manager
  feedbackCandidate: string;       // candidate-facing summary
  feedbackInterviewer: string;     // coaching summary for the interviewer
  followUps: InterviewFollowUp[];  // open threads to carry into later rounds
  provenance?: DecisionProvenance; // Phase 2 — set on the AI path
}

// ── Core Claude caller ─────────────────────────────────────

// Metadata about a completed Claude call — used by Phase 2 decision
// provenance so every candidate-affecting decision records the model
// that was ACTUALLY used (the API echoes back the resolved model id,
// which can differ from the alias we requested) plus token usage.
export interface ClaudeCallMeta {
  text: string;
  model: string;            // resolved model id from the API response
  requestedModel: string;   // what we asked for
  inputTokens: number | null;
  outputTokens: number | null;
}

async function callClaudeMeta(
  systemPrompt: string,
  userPrompt: string,
  model: string = MODEL,
): Promise<ClaudeCallMeta> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  return {
    text: data.content[0].text as string,
    model: (data.model as string) ?? model,
    requestedModel: model,
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
  };
}

// Backward-compatible thin wrapper: returns only the text. Existing
// callers that don't need provenance keep using this unchanged.
async function callClaude(systemPrompt: string, userPrompt: string, model: string = MODEL): Promise<string> {
  return (await callClaudeMeta(systemPrompt, userPrompt, model)).text;
}

// Provenance attached to an AI-produced result so the caller (which has
// the candidate id + db) can log it to the decision_log. Phase 2.
export interface DecisionProvenance {
  model: string;          // resolved model id from the API response
  requestedModel: string;
  promptId: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

// ── Question generation ────────────────────────────────────

interface QuestionGenInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  eppProfile?: any;           // raw EPP result from Criteria Corp
  eppValuesMatchScore?: number | null;
  eppTraits?: Array<{ trait: string; percentile: number }>;
  companyValuesMatchScore?: number | null;
  companyValuesNotes?: string | null;
  valueScores?: Array<{ value: string; score: number }>;
  resumeReviewNotes?: string | null;
  resumeReviewScore?: number | null;
  workSampleScore?: number | null;
  ccatScore?: number | null;
}

export async function generateInterviewQuestions(
  input: QuestionGenInput
): Promise<InterviewQuestion[]> {
  if (SANDBOX) {
    console.log(
      `[AI SANDBOX] generateInterviewQuestions | Candidate: ${input.firstName} ${input.lastName} | Role: ${input.jobTitle ?? 'Unknown'}`
    );
    return getMockQuestions(input);
  }

  const system = `You are an expert interviewer at Lightspeed Systems, a K-12 edtech company.
Generate the TAILORED portion of an interview — the ~30% specific to THIS candidate (a fixed ~70% standard set is handled elsewhere).

Base every question on the candidate data below: their EPP personality profile (12 Criteria Corp traits as percentiles), their company-values screening result, their CCAT cognitive score, and anything noteworthy in their resume review. Lightspeed's core values: ${LIGHTSPEED_VALUES.join(', ')}.

Every question must do ONE of three jobs, and say which in the rationale:
1. CONFIRM a conclusion the data suggests (e.g. a very high/low trait percentile, a strong/weak value fit, a notable CCAT) — probe whether that read holds up.
2. FILL a gap the data does NOT show (something important for the role none of the data speaks to).
3. CLARIFY an ambiguity, tension, or anomaly (conflicting signals, a resume gap, an EPP-vs-values mismatch).

Prioritize extreme percentiles (very high or very low), weak value scores, and resume flags. Return a JSON array of 8-12 questions. Each item:
- "category": one of "EPP", "Company Values", "Cognitive (CCAT)", "Resume", "Clarification"
- "question": the question text
- "rationale": 1-2 sentences — which data point drove it, and whether it is confirming / filling a gap / clarifying.
Return ONLY the JSON array, no other text.`;

  const user = `Generate tailored interview questions for:

Candidate: ${input.firstName} ${input.lastName}
Role: ${input.jobTitle ?? 'Unknown'}

CCAT (cognitive) score: ${input.ccatScore != null ? `${input.ccatScore} out of 50` : 'N/A'} (raw number of correct answers out of 50 questions — higher is stronger; e.g. 46/50 is high, ~25/50 is middling, under ~18/50 is weak)

EPP personality profile (percentiles 0-100 vs norm):
${(input.eppTraits && input.eppTraits.length)
    ? input.eppTraits.map((t) => `- ${t.trait}: ${t.percentile}`).join('\n')
    : (input.eppProfile ? JSON.stringify(input.eppProfile) : 'Not available')}

Company-values screening:
Match score: ${input.companyValuesMatchScore ?? input.eppValuesMatchScore ?? 'N/A'}
Notes: ${input.companyValuesNotes || 'None'}
Per-value scores (1-5):
${(input.valueScores && input.valueScores.length)
    ? input.valueScores.map((v) => `- ${v.value}: ${v.score}`).join('\n')
    : 'None recorded'}

Resume review:
Score: ${input.resumeReviewScore ?? 'N/A'}
Notes: ${input.resumeReviewNotes || 'None provided'}

Work sample score: ${input.workSampleScore ?? 'N/A'}`;

  try {
    const raw = await callClaude(system, user, 'claude-sonnet-4-6');
    const questions = JSON.parse(extractJsonArray(raw)) as InterviewQuestion[];
    return questions;
  } catch (err) {
    console.error('[AI] generateInterviewQuestions failed:', err);
    return getMockQuestions(input);
  }
}

// ── Interview feedback analysis ────────────────────────────

interface FeedbackInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  transcript?: string | null;
  interviewQuestions?: InterviewQuestion[] | null;
  ccatScore?: number | null;
  eppValuesMatchScore?: number | null;
  workSampleScore?: number | null;
  resumeReviewScore?: number | null;
}

export async function analyzeInterviewTranscript(
  input: FeedbackInput
): Promise<InterviewFeedback> {
  if (SANDBOX) {
    console.log(
      `[AI SANDBOX] analyzeInterviewTranscript | Candidate: ${input.firstName} ${input.lastName}`
    );
    return getMockFeedback(input);
  }

  const questionList = input.interviewQuestions
    ? input.interviewQuestions.map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join('\n')
    : 'No pre-generated questions available.';

  const system = `You are an expert HR analyst and interview coach at Lightspeed Systems reviewing a candidate interview.
You will receive a transcript of the interview and the list of questions that were supposed to be asked.
Produce THREE outputs:
  1. a detailed hiring manager report about the CANDIDATE,
  2. a constructive candidate-facing feedback summary, and
  3. a coaching summary for the INTERVIEWER about how they ran the interview.

Read the transcript closely for coverage and evasion. Determine which of the planned questions were actually
asked, which were skipped, and — critically — any questions the candidate DODGED or AVOIDED (deflected, gave a
non-answer, redirected, or answered a different question than the one asked). Note where the interviewer let an
evasive or incomplete answer go without following up.

Lightspeed's core values: ${LIGHTSPEED_VALUES.join(', ')}.`;

  const user = `Analyze this interview for ${input.firstName} ${input.lastName}, applying for ${input.jobTitle ?? 'Unknown'}.

Prior scores:
- CCAT: ${input.ccatScore != null ? `${input.ccatScore}/50` : 'N/A'} (raw correct out of 50 questions; higher is stronger)
- EPP Values Match: ${input.eppValuesMatchScore ?? 'N/A'}%
- Work Sample: ${input.workSampleScore ?? 'N/A'}
- Resume Review: ${input.resumeReviewScore ?? 'N/A'}

Planned interview questions:
${questionList}

Interview transcript:
${input.transcript || 'No transcript available.'}

Return a JSON object with:
{
  "interviewScore": <integer 0-100>,
  "feedbackHr": "<full hiring manager report — include: overall assessment; WHAT WENT WELL and WHAT DIDN'T for the candidate; which planned questions were asked vs. missed; which questions the candidate did not fully answer or actively AVOIDED/deflected; values alignment; recommendation>",
  "feedbackCandidate": "<candidate-facing summary — professional, constructive, positive where warranted, specific on growth areas, no internal scoring details or interviewer critique>",
  "feedbackInterviewer": "<coaching summary addressed to the interviewer — WHAT THEY DID WELL and WHAT TO IMPROVE in how they conducted the interview; which planned questions they did not get to; where they let the candidate dodge a question without following up; question coverage and time balance; specific, actionable, collegial>",
  "followUps": [ { "type": "avoided" | "half_answered" | "suggested", "text": "<one specific question or topic a LATER interview round should ask this candidate — for 'avoided' name what they dodged, for 'half_answered' name what needs more depth, for 'suggested' name a topic worth probing next. Write it about the CANDIDATE only, never about the interviewer.>" } ]
}

Return ONLY the JSON object, no other text.`;

  try {
    const meta = await callClaudeMeta(system, user, PROMPTS.interviewFeedback.model);
    const raw = meta.text;
    const fenced = raw.replace(/```json|```/g, '');
    const objStart = fenced.indexOf('{');
    const objEnd = fenced.lastIndexOf('}');
    const feedback = JSON.parse(fenced.slice(objStart, objEnd + 1)) as InterviewFeedback;
    if (!Array.isArray(feedback.followUps)) feedback.followUps = [];
    feedback.provenance = {
      model: meta.model,
      requestedModel: meta.requestedModel,
      promptId: PROMPTS.interviewFeedback.id,
      promptVersion: PROMPTS.interviewFeedback.version,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
    };
    return feedback;
  } catch (err) {
    console.error('[AI] analyzeInterviewTranscript failed:', err);
    return getMockFeedback(input);
  }
}

// ── Transcript synthesis (no-Zoom demo path) ───────────────
// When Zoom credentials aren't configured we still want the full
// "recording → transcript → feedback → email" flow to work. This
// produces a realistic interview transcript from the role + planned
// questions. Uses Claude when a key is present; returns a canned but
// realistic transcript in SANDBOX. HR can also paste a real transcript
// instead, in which case this is not called.
export interface TranscriptSynthInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  interviewerName?: string | null;
  interviewQuestions?: InterviewQuestion[] | null;
}

export async function synthesizeInterviewTranscript(input: TranscriptSynthInput): Promise<string> {
  if (SANDBOX) {
    console.log(`[AI SANDBOX] synthesizeInterviewTranscript | ${input.firstName} ${input.lastName}`);
    return getMockTranscript(input);
  }
  const qs = (input.interviewQuestions ?? []).map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join('\n') || 'No pre-generated questions available.';
  const system = `You are generating a REALISTIC but SYNTHETIC interview transcript for a demo of Lightspeed Systems' hiring tool. It is clearly not a real interview. Make it read like a genuine ~30-minute Zoom transcript: speaker labels ("Interviewer:" / candidate first name + ":"), natural back-and-forth, some strong answers and some weaker/evasive ones. Deliberately (a) skip one or two of the planned questions and (b) have the candidate dodge or give a non-answer to at least one question, so downstream feedback has something to catch. Plain text only, no markdown.`;
  const user = `Candidate: ${input.firstName} ${input.lastName}\nRole: ${input.jobTitle ?? 'Unknown'}\nInterviewer: ${input.interviewerName ?? 'Interviewer'}\n\nPlanned questions:\n${qs}\n\nWrite the transcript.`;
  try {
    return await callClaude(system, user);
  } catch (err) {
    console.error('[AI] synthesizeInterviewTranscript failed, using mock:', err);
    return getMockTranscript(input);
  }
}

function getMockTranscript(input: TranscriptSynthInput): string {
  const iv = input.interviewerName || 'Interviewer';
  const c = input.firstName;
  const role = input.jobTitle ?? 'the role';
  return `[SANDBOX SAMPLE TRANSCRIPT — synthetic, generated for demo because Zoom is not connected]

${iv}: Thanks for joining, ${c}. To start, tell me a bit about your background and what drew you to ${role} at Lightspeed.
${c}: Thanks for having me. I've spent the last five years in K-12 edtech, most recently leading a small team. Lightspeed's focus on student safety is what really drew me in.
${iv}: Great. Tell me about a time you had to adapt quickly to a significant change at work.
${c}: Sure — mid-project our biggest client changed their requirements. I reorganized the roadmap over a weekend, got the team realigned Monday, and we shipped only a week late. I over-communicated the whole way.
${iv}: Nice, that's a clear example. Describe a time you had to hold yourself accountable for a mistake.
${c}: I shipped a config change that broke reporting for a day. I owned it in the postmortem, wrote the fix, and added a test so it couldn't happen again.
${iv}: Good. On the work sample — your score came in a little lower than we'd expect. Walk me through your approach there.
${c}: Yeah, well, the team dynamic on that kind of thing is always tricky, and honestly the prompt was a bit ambiguous. I think as a group we'd have done better. Anyway, I'm more of a systems thinker.
${iv}: Okay. How do you stay current in your field?
${c}: I read a lot, follow a few newsletters, and I did a course on data pipelines last quarter that I've applied at work.
${iv}: Let's talk collaboration — tell me about a time you disagreed with a team decision.
${c}: I pushed back on a vendor choice once. I laid out the tradeoffs in a doc, we discussed it, and even though we went the other way I supported it fully.
${iv}: That's helpful. I think we're about at time — really appreciate you walking me through all this, ${c}. We'll be in touch on next steps.
${c}: Thank you, appreciate the conversation.

[Note: interviewer did not ask the planned employment-gap question or the competing-priorities question; candidate deflected on the work-sample question.]`;
}

// ── Sandbox mock data ──────────────────────────────────────

function getMockQuestions(input: QuestionGenInput): InterviewQuestion[] {
  return [
    {
      category: 'Behavioral',
      question: 'Tell me about a time you had to adapt quickly to a significant change at work. What was the situation and how did you handle it?',
      rationale: 'Assesses adaptability, a core Lightspeed value, and aligns with the dynamic nature of K-12 edtech.',
    },
    {
      category: 'EPP/Values',
      question: 'Describe a situation where you had to hold yourself accountable for a mistake. What did you do and what was the outcome?',
      rationale: 'Probes accountability alignment based on EPP values match results.',
    },
    {
      category: 'Role-Specific',
      question: `What experience do you have in ${input.jobTitle ?? 'this type of role'}, and what has been your most impactful contribution?`,
      rationale: 'Directly assesses role-relevant experience and ownership mindset.',
    },
    {
      category: 'Resume',
      question: 'I noticed a gap in your employment history between [X] and [Y]. Can you walk me through what you were doing during that time?',
      rationale: 'Flag from resume review — probing employment continuity.',
    },
    {
      category: 'References',
      question: 'Your references spoke highly of your technical skills. Can you give me an example of a time your technical ability directly solved a business problem?',
      rationale: 'Builds on positive reference feedback while testing depth.',
    },
    {
      category: 'Behavioral',
      question: 'Tell me about a time you disagreed with a team decision. How did you handle it while maintaining collaboration?',
      rationale: 'Tests collaboration and respect values under pressure.',
    },
    {
      category: 'EPP/Values',
      question: 'How do you typically approach situations where you have competing priorities and limited time? Walk me through a specific example.',
      rationale: 'Assesses drive and ownership based on EPP profile.',
    },
    {
      category: 'Role-Specific',
      question: 'How do you stay current in your field? What have you learned in the last 6 months that you have applied at work?',
      rationale: 'Tests innovation mindset and commitment to continuous improvement.',
    },
  ];
}

function getMockFeedback(input: FeedbackInput): InterviewFeedback {
  return {
    interviewScore: 72,
    feedbackHr: `[SANDBOX] Interview Feedback — Hiring Manager Report
Candidate: ${input.firstName} ${input.lastName} | Role: ${input.jobTitle ?? 'Unknown'}

OVERALL ASSESSMENT
The candidate demonstrated solid technical competency and genuine enthusiasm for the role. Communication was clear and structured. Some areas need further probing before a final decision.

WHAT WENT WELL
- Strong answers on behavioral questions; provided specific, structured examples (STAR format)
- Values alignment on Accountability and Collaboration came through clearly
- Demonstrated curiosity and self-awareness when discussing past mistakes

WHAT DIDN'T GO WELL
- Responses on Ownership and Drive were surface-level; lacked quantifiable impact
- When asked about the work sample, deflected rather than owning the lower score

QUESTIONS ASKED vs. MISSED
- All 8 planned questions were asked
- The candidate gave incomplete answers on Q4 (employment gap) and Q7 (competing priorities)

RECOMMENDATION
Proceed with caution. Recommend a second-round interview focused specifically on ownership and impact quantification before making an offer.`,
    feedbackCandidate: `[SANDBOX] Thank you for interviewing with Lightspeed Systems, ${input.firstName}.

You did a great job demonstrating your collaborative approach and showed clear accountability when discussing challenges you've faced in past roles. Your enthusiasm for the position and knowledge of the K-12 space came through strongly.

As you continue in your career, one area to develop is connecting your contributions to measurable business outcomes — hiring teams love to hear the specific impact you drove, not just the actions you took.

We'll be in touch with next steps shortly.`,
    feedbackInterviewer: `[SANDBOX] Interview Coaching Summary — for the Interviewer

Thanks for interviewing ${input.firstName} ${input.lastName}. Here's a quick debrief on how the conversation went so we keep raising the bar on our interviews.

WHAT WENT WELL
- Good rapport early; the candidate was at ease and opened up on behavioral questions.
- You covered the core values questions (Accountability, Collaboration) and gave the candidate room to give STAR-style answers.
- Clear structure — the conversation moved logically through background, values, and role fit.

WHAT TO IMPROVE
- Two planned questions weren't asked: the employment-gap probe (Q4) and the competing-priorities question (Q7). Both were flagged as important going in.
- The candidate deflected on the work-sample question — answered a slightly different question than the one asked — and it wasn't followed up. A simple "that's helpful, but specifically what was YOUR contribution?" would have closed the loop.
- Ownership/Drive stayed surface-level; pushing once more for quantifiable impact ("what changed as a result?") would have pulled out stronger signal.

QUESTIONS THE CANDIDATE AVOIDED
- The work-sample score question (redirected to team context rather than owning the individual result).
- Partial dodge on the employment-gap question — gave a timeline but not the substance.

Overall a solid, well-run interview; the main opportunity is following up harder when an answer is evasive or incomplete.`,
    followUps: [
      { type: 'avoided', text: 'Own the individual contribution on the work sample — what specifically was YOURS vs. the team\'s?' },
      { type: 'half_answered', text: 'The employment-gap timeline was given but not the substance — what happened and what was learned?' },
      { type: 'suggested', text: 'Probe ownership and quantifiable impact ("what changed as a result?") for the Drive value.' },
    ],
  };
}


// ============================================================
// RESUME SCREEN — check a resume against a job's REQUIRED
// qualifications only. Flags missing requirements. Never judges
// the candidate on anything else (no preferred quals, no
// subjective quality). Flag-only — does not reject.
// ============================================================

// Current Sonnet (ai.ts MODEL above is an older 3.5 snapshot; use the
// same current model the feedback/chat paths use for this screen).
const RESUME_SCREEN_MODEL = 'claude-sonnet-4-6';

export interface RequirementCheck {
  requirement: string;
  met: boolean;
  evidence: string;   // where found in resume, or why not found
}

export interface ResumeScreenResult {
  requirements: RequirementCheck[];
  missing: string[];
  metCount: number;
  totalCount: number;
  summary: string;
  // 'ai' = real Claude screen (trustworthy enough to drive an auto-decision);
  // 'keyword' = deterministic fallback (advisory only — do NOT auto-reject on it).
  mode: 'ai' | 'keyword';
  provenance?: DecisionProvenance; // Phase 2 — set on the AI path
}

// Split a required-qualifications blob into individual requirement lines.
// Handles newline / bullet / semicolon separators and JSON-array strings.
function splitRequirements(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x).trim()).filter((x) => x.length > 2);
      }
    } catch { /* fall through to line split */ }
  }
  return trimmed
    .split(/\r?\n|•|·/)
    .map((line) => line.replace(/^\s*[-*–—\d.)]+\s*/, '').trim())
    .filter((line) => line.length > 2);
}

function summarizeScreen(checks: RequirementCheck[], mode: 'ai' | 'keyword' = 'ai'): ResumeScreenResult {
  const missing = checks.filter((c) => !c.met).map((c) => c.requirement);
  const metCount = checks.length - missing.length;
  const summary =
    checks.length === 0
      ? 'No required qualifications listed on this job description — nothing to screen.'
      : missing.length === 0
        ? `Resume screen: all ${checks.length} required qualifications appear to be met.`
        : `Resume screen: ${metCount}/${checks.length} required qualifications met. MISSING: ${missing.join('; ')}.`;
  return { requirements: checks, missing, metCount, totalCount: checks.length, summary, mode };
}

// Deterministic keyword fallback (used in SANDBOX / on AI failure).
// Marks a requirement "met" when enough of its significant words appear
// in the resume. Rough, but lets the flow be tested without an API key.
const STOPWORDS = new Set([
  'and','or','the','a','an','of','to','in','with','for','on','at','by','as','is','are','be',
  'experience','years','strong','proven','track','record','ability','including','related','field',
  'plus','equivalent','practical','hands','skills','knowledge','expertise','using','across','level',
]);

function keywordScreen(requirements: string[], resumeText: string): ResumeScreenResult {
  const hay = resumeText.toLowerCase();
  const checks: RequirementCheck[] = requirements.map((req) => {
    const words = req
      .toLowerCase()
      .replace(/[^a-z0-9+ ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const uniq = Array.from(new Set(words));
    if (uniq.length === 0) return { requirement: req, met: true, evidence: 'No specific keywords to check.' };
    const hits = uniq.filter((w) => hay.includes(w));
    const ratio = hits.length / uniq.length;
    const met = ratio >= 0.5;
    return {
      requirement: req,
      met,
      evidence: met
        ? `Matched keywords: ${hits.slice(0, 6).join(', ')}`
        : `Few/no matching terms found (${hits.length}/${uniq.length}).`,
    };
  });
  return summarizeScreen(checks, 'keyword');
}

function extractJsonArray(raw: string): string {
  const fenced = raw.replace(/```json|```/g, '');
  const start = fenced.indexOf('[');
  const end = fenced.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) return fenced.slice(start, end + 1);
  return fenced.trim();
}

export async function screenResumeRequirements(
  resumeText: string,
  requiredQualificationsRaw: string,
): Promise<ResumeScreenResult> {
  const requirements = splitRequirements(requiredQualificationsRaw || '');
  if (requirements.length === 0) return summarizeScreen([]);

  if (!resumeText || resumeText.trim().length < 20) {
    return summarizeScreen(
      requirements.map((r) => ({ requirement: r, met: false, evidence: 'No resume text provided.' })),
      'keyword',
    );
  }

  if (SANDBOX) {
    console.log('[AI SANDBOX] screenResumeRequirements | keyword fallback (no ANTHROPIC_API_KEY)');
    return keywordScreen(requirements, resumeText);
  }

  const system = `You screen a candidate's resume against a job's REQUIRED qualifications ONLY.
For EACH required qualification, decide whether the resume shows evidence the candidate meets it.
Be generous: mark "met": false only when there is genuinely no supporting evidence in the resume.
Do NOT evaluate the candidate on anything beyond these required qualifications — ignore preferred/
nice-to-have items and do not make any subjective quality judgement. The goal is only to flag
requirements that are missing, not to rank or reject the candidate.
Return ONLY a JSON array. Each element:
  { "requirement": "<exact requirement text>", "met": true|false, "evidence": "<short reason / where found>" }`;

  const user = `REQUIRED QUALIFICATIONS:\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nRESUME:\n${resumeText}`;

  try {
    const meta = await callClaudeMeta(system, user, RESUME_SCREEN_MODEL);
    const raw = meta.text;
    const parsed = JSON.parse(extractJsonArray(raw)) as RequirementCheck[];
    // Normalize + guard against the model dropping/renaming items.
    const checks: RequirementCheck[] = requirements.map((req) => {
      const hit = parsed.find((p) => p && typeof p.requirement === 'string'
        && p.requirement.trim().toLowerCase().slice(0, 40) === req.trim().toLowerCase().slice(0, 40));
      if (hit) return { requirement: req, met: !!hit.met, evidence: String(hit.evidence ?? '') };
      return { requirement: req, met: false, evidence: 'Not assessed by the model — treat as unverified.' };
    });
    return {
      ...summarizeScreen(checks),
      provenance: {
        model: meta.model,
        requestedModel: meta.requestedModel,
        promptId: PROMPTS.resumeScreen.id,
        promptVersion: PROMPTS.resumeScreen.version,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      },
    };
  } catch (err) {
    console.error('[AI] screenResumeRequirements failed — falling back to keyword screen:', err);
    return keywordScreen(requirements, resumeText);
  }
}


// ============================================================
// WORK-SAMPLE SCORING (rubric-driven)
//
// Scores a candidate's work-sample submission AGAINST the task's own
// scoring guides, read at scoring time. Nothing about any specific work
// sample is hardcoded here, so when the work samples / rubrics change,
// this scorer keeps working with the new rubric — no code change.
//
// Advisory only: it returns a score + rationale to inform a human. It
// does NOT advance or reject a candidate. If no rubric is configured
// yet, it scores against the brief and says so, with lower confidence.
// ============================================================
const WORK_SAMPLE_MODEL = 'claude-sonnet-4-6';

export interface WorkSampleScoreInput {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  taskTitle?: string | null;
  brief?: string | null;
  scoringGuideWork?: string | null; // rubric — work quality (may be null)
  scoringGuideAi?: string | null;   // rubric — AI skill (may be null)
  submission: string;               // candidate's written response
  link?: string | null;             // optional deliverable link
}

export interface WorkSampleScoreResult {
  overallScore: number;      // 0-100
  workQualityScore: number;  // 0-100
  aiSkillScore: number;      // 0-100
  summary: string;
  strengths: string[];
  concerns: string[];
  rubricUsed: boolean;       // false when no scoring guide was configured
  criteria: WorkSampleCriterion[]; // per-rubric-point breakdown
  mode: 'ai' | 'placeholder';
  provenance?: DecisionProvenance; // Phase 2 — set on the AI path
}

export interface WorkSampleCriterion {
  dimension: 'work' | 'ai'; // which scoring guide it came from
  criterion: string;        // the specific thing the rubric asks for
  score: number;            // 0-100 on this point
  reason: string;           // one line, grounded in the submission
}

function placeholderWorkSampleScore(input: WorkSampleScoreInput): WorkSampleScoreResult {
  const hasRubric = !!(input.scoringGuideWork || input.scoringGuideAi);
  return {
    overallScore: 74,
    workQualityScore: 76,
    aiSkillScore: 71,
    summary:
      'Sandbox draft (no scoring model connected). This is an illustrative per-criterion breakdown that shows the ' +
      'shape of a real evaluation. ' +
      (hasRubric ? 'A rubric was on file for this task. ' : 'No rubric was configured for this task. ') +
      'Numbers and reasons are placeholders. Connect a model and re-score before relying on this.',
    strengths: [
      'Submission received and readable.',
      'Response is organized and easy to follow.',
      'Candidate showed the prompts and iterations they used.',
    ],
    concerns: [
      'Sandbox draft, not a real evaluation.',
      'Connect a scoring model and re-score for grounded, submission-specific reasons.',
    ],
    rubricUsed: hasRubric,
    criteria: [
      { dimension: 'work', criterion: 'Understood the task and scoped the problem', score: 78, reason: 'Placeholder. A live scorer would cite how the submission framed the task.' },
      { dimension: 'work', criterion: 'Quality and correctness of the work', score: 75, reason: 'Placeholder. A live scorer would cite the substance of the work delivered.' },
      { dimension: 'work', criterion: 'Communication and structure', score: 77, reason: 'Placeholder. A live scorer would cite clarity and organization.' },
      { dimension: 'ai', criterion: 'Prompt quality and iteration', score: 72, reason: 'Placeholder. A live scorer would cite the prompts and iterations shown.' },
      { dimension: 'ai', criterion: 'Judgment on AI output', score: 70, reason: 'Placeholder. A live scorer would cite where the candidate corrected the model.' },
    ],
    mode: 'placeholder',
  };
}

export async function scoreWorkSample(input: WorkSampleScoreInput): Promise<WorkSampleScoreResult> {
  const hasRubric = !!(input.scoringGuideWork || input.scoringGuideAi);

  if (SANDBOX) {
    console.log('[AI SANDBOX] scoreWorkSample | placeholder draft (no ANTHROPIC_API_KEY)');
    return placeholderWorkSampleScore(input);
  }

  const system = `You are scoring a candidate's work-sample submission for a hiring team at Lightspeed Systems (K-12 edtech).
Score STRICTLY against the provided scoring guides — do not invent your own criteria. A work sample measures BOTH
work quality AND AI skill (the candidate does real role work and shows the prompts/iterations they used).
Be fair and evidence-based, cite what you saw in the submission, and do NOT speculate about protected characteristics.
This is an AI draft to inform a human reviewer — never a final decision.
If a scoring guide is missing, score that dimension from the brief and general professional quality, and lower your confidence.
Break the score down criterion by criterion: for EACH distinct thing the scoring guides ask for,
give the specific criterion, a 0-100 score for it, and a one-line reason citing the submission.
Return ONLY JSON:
{
  "workQualityScore": 0-100,
  "aiSkillScore": 0-100,
  "overallScore": 0-100,
  "summary": "2-3 sentences grounded in the submission",
  "strengths": ["..."],
  "concerns": ["..."],
  "criteria": [ { "dimension": "work" | "ai", "criterion": "the specific rubric point", "score": 0-100, "reason": "one line, grounded in the submission" } ]
}`;

  const user = `Candidate: ${input.firstName} ${input.lastName}
Role: ${input.jobTitle ?? 'Unknown'}
Task: ${input.taskTitle ?? 'Unknown'}

--- TASK BRIEF ---
${input.brief || 'not provided'}

--- SCORING GUIDE: WORK QUALITY ---
${input.scoringGuideWork || 'not configured'}

--- SCORING GUIDE: AI SKILL ---
${input.scoringGuideAi || 'not configured'}

--- CANDIDATE SUBMISSION ---
${input.submission || '(empty)'}

--- DELIVERABLE LINK ---
${input.link || 'none'}`;

  try {
    const meta = await callClaudeMeta(system, user, WORK_SAMPLE_MODEL);
    const raw = meta.text;
    const fenced = raw.replace(/```json|```/g, '');
    const parsed = JSON.parse(fenced.slice(fenced.indexOf('{'), fenced.lastIndexOf('}') + 1));
    const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    const work = clamp(parsed.workQualityScore);
    const ai = clamp(parsed.aiSkillScore);
    const overall = parsed.overallScore != null ? clamp(parsed.overallScore) : Math.round((work + ai) / 2);
    return {
      overallScore: overall,
      workQualityScore: work,
      aiSkillScore: ai,
      summary: String(parsed.summary ?? ''),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
      rubricUsed: hasRubric,
      criteria: Array.isArray(parsed.criteria)
        ? parsed.criteria.map((c: any) => ({
            dimension: c.dimension === 'ai' ? 'ai' : 'work',
            criterion: String(c.criterion ?? ''),
            score: clamp(c.score),
            reason: String(c.reason ?? ''),
          })).filter((c: any) => c.criterion)
        : [],
      mode: 'ai',
      provenance: {
        model: meta.model,
        requestedModel: meta.requestedModel,
        promptId: PROMPTS.workSampleScore.id,
        promptVersion: PROMPTS.workSampleScore.version,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
      },
    };
  } catch (err) {
    console.error('[AI] scoreWorkSample failed — returning placeholder:', err);
    return placeholderWorkSampleScore(input);
  }
}

// ============================================================
// ROLE-LEVEL GENERATION (fires when an intake is approved)
// ============================================================

export interface RoleJD {
  jobTitle: string;
  summary: string;
  responsibilities: string;
  requiredQualifications: string;
  preferredQualifications: string;
  workSampleInstructions: string;
  eppValues: string[];
}

// The canonical Lightspeed company values the JD's EPP match is drawn from
// (must stay in sync with LIGHTSPEED_VALUES in routers/jobDescriptions.ts).
const EPP_VALUE_OPTIONS = [
  'Coachable', 'Purposeful', 'Resilient', 'Collaborative', 'Humble', 'Transparent',
  'Accountable', 'Courageous', 'Creative', 'Driven', 'Focused', 'High Standards', 'Self-Aware',
];

const DEFAULT_EPP_VALUES = ['Coachable', 'Driven', 'Collaborative', 'Accountable', 'High Standards'];

// Normalize whatever the model returns (array or comma/newline string, any case,
// with or without leading bullets) to canonical Lightspeed value names. Falls back
// to a sensible default so a generated JD always carries an EPP values match.
function normalizeEppValues(raw: any): string[] {
  let items: string[] = [];
  if (Array.isArray(raw)) items = raw.map((x) => String(x));
  else if (typeof raw === 'string') items = raw.split(/[,\n;]/);
  const canon = new Map(EPP_VALUE_OPTIONS.map((v) => [v.toLowerCase().replace(/[^a-z]/g, ''), v] as const));
  const out: string[] = [];
  for (const it of items) {
    const key = it.trim().replace(/^[-*\s]+/, '').toLowerCase().replace(/[^a-z]/g, '');
    const hit = canon.get(key);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out.length ? out.slice(0, 6) : [...DEFAULT_EPP_VALUES];
}

function templateJD(title: string, department: string, description?: string | null): RoleJD {
  const note = description ? ` Focus per intake: ${description}.` : '';
  return {
    jobTitle: title,
    summary: `Lightspeed Systems is hiring a ${title} to join our ${department} team.${note} [Draft auto-generated from the intake — review and refine before publishing.]`,
    responsibilities: '- Own key deliverables for the team\n- Collaborate across functions to ship outcomes\n- Bring an ownership mindset to day-to-day work',
    requiredQualifications: `- Relevant experience in ${department}\n- Strong communication and follow-through\n- Alignment with Lightspeed's values`,
    preferredQualifications: '- Prior K-12 or edtech experience\n- Comfort using AI tools in daily work',
    workSampleInstructions: `A short, realistic task that mirrors day-to-day ${department} work${description ? ' (' + description + ')' : ''} (about 1-2 hours). [Draft auto-generated from the intake - review and refine before sending.]`,
    eppValues: [...DEFAULT_EPP_VALUES],
  };
}

export async function generateRoleJD(input: {
  department: string; seniority?: string | null; workArrangement?: string | null;
  location?: string | null; salaryMin?: number | null; salaryMax?: number | null;
  baseJd?: { jobTitle: string; summary?: string | null; responsibilities?: string | null; requiredQualifications?: string | null; preferredQualifications?: string | null; workSampleInstructions?: string | null; eppValues?: string[] | null } | null;
  changeNote?: string | null;
}): Promise<RoleJD> {
  const title = input.baseJd?.jobTitle ?? (`${input.department}${input.seniority ? ' ' + input.seniority : ''}`.trim() + (input.seniority ? '' : ' Position'));
  if (SANDBOX) {
    console.log(`[AI SANDBOX] generateRoleJD | ${title}${input.baseJd ? ' (from base + change note)' : ''}`);
    if (input.baseJd) {
      return {
        jobTitle: input.baseJd.jobTitle,
        summary: `${input.baseJd.summary ?? ''}${input.changeNote ? `\n\n[Updated per intake — how the role differs: ${input.changeNote}]` : ''}`.trim(),
        responsibilities: input.baseJd.responsibilities ?? '',
        requiredQualifications: input.baseJd.requiredQualifications ?? '',
        preferredQualifications: input.baseJd.preferredQualifications ?? '',
        workSampleInstructions: `${input.baseJd.workSampleInstructions ?? ''}${input.changeNote ? `\n\n[Adapted per intake — reflect: ${input.changeNote}]` : ''}`.trim(),
        eppValues: normalizeEppValues(input.baseJd.eppValues),
      };
    }
    return templateJD(title, input.department, input.changeNote);
  }
  const system = `You write concise, inclusive job descriptions for Lightspeed Systems, a K-12 edtech company. Core values: ${LIGHTSPEED_VALUES.join(', ')}. Return ONLY JSON with keys: jobTitle, summary, responsibilities, requiredQualifications, preferredQualifications, workSampleInstructions (a short realistic task the candidate would do, ~1-2 hours), eppValues (an array of 3-6 value names chosen ONLY from this list: ${EPP_VALUE_OPTIONS.join(', ')}). The list fields should be short newline-separated bullets using "- ". Author net-new, role-specific content that fits THIS role; do not merely restate the source.`;
  const user = input.baseJd
    ? `Here is an existing job description for ${input.baseJd.jobTitle} (${input.department}):
Summary: ${input.baseJd.summary ?? ''}
Responsibilities: ${input.baseJd.responsibilities ?? ''}
Required qualifications: ${input.baseJd.requiredQualifications ?? ''}
Preferred qualifications: ${input.baseJd.preferredQualifications ?? ''}
Work sample task: ${input.baseJd.workSampleInstructions ?? '(none on file)'}

The role should DIFFER from that as follows: ${input.changeNote ?? ''}

Produce the UPDATED job description AND an updated work sample task, reflecting those differences — keep what still applies, change what should change.`
    : `Draft a brand-new job description for a role in ${input.department}. Work arrangement: ${input.workArrangement ?? 'On-site'}${input.location ? ', ' + input.location : ''}.${input.salaryMin && input.salaryMax ? ` Salary band $${input.salaryMin}–$${input.salaryMax}.` : ''}${input.changeNote ? `\n\nRole description provided by the hiring team (build the ENTIRE JD, work sample, and interview focus from this): ${input.changeNote}` : ''}\n\nProduce the full job description AND a fitting work sample task. Keep it realistic and concise.`;
  try {
    const jd = JSON.parse(await callClaude(system, user));
    return { jobTitle: jd.jobTitle || title, summary: jd.summary || '', responsibilities: jd.responsibilities || '', requiredQualifications: jd.requiredQualifications || '', preferredQualifications: jd.preferredQualifications || '', workSampleInstructions: jd.workSampleInstructions || '', eppValues: normalizeEppValues(jd.eppValues) };
  } catch (err) { console.error('[AI] generateRoleJD failed:', err); return input.baseJd ? { jobTitle: input.baseJd.jobTitle, summary: input.baseJd.summary ?? '', responsibilities: input.baseJd.responsibilities ?? '', requiredQualifications: input.baseJd.requiredQualifications ?? '', preferredQualifications: input.baseJd.preferredQualifications ?? '', workSampleInstructions: input.baseJd.workSampleInstructions ?? '', eppValues: normalizeEppValues(input.baseJd.eppValues) } : templateJD(title, input.department, input.changeNote); }
}

export interface WorkSampleTask {
  brief: string;
  showYourWorkInstructions: string;
  scoringGuideWork: string;
  scoringGuideAi: string;
  difficulty: 'Entry' | 'Mid' | 'Senior';
  timeLimitMin: number;
}

// Generate a curated-style work sample for a brand-new role (new headcount) where
// there is no existing task to reuse. One task measures BOTH work quality and AI
// skill (the candidate shows the prompts/iterations they used).
export async function generateWorkSampleTask(input: {
  department: string; jobTitle: string; workSampleInstructions?: string | null; jdSummary?: string | null;
}): Promise<WorkSampleTask> {
  const fallbackBrief = (input.workSampleInstructions && input.workSampleInstructions.trim())
    || `A short, realistic task that mirrors day-to-day work for a ${input.jobTitle} in ${input.department} (about 1-2 hours).`;
  const template: WorkSampleTask = {
    brief: fallbackBrief,
    showYourWorkInstructions: 'Submit your final work AND the prompts / AI iterations you used to get there, so we can see both the quality of the output and how you worked with AI.',
    scoringGuideWork: `- Correctness and completeness for a ${input.jobTitle}\n- Clarity and structure\n- Judgment and prioritization\n- Practicality of the result`,
    scoringGuideAi: '- Effective, specific prompting\n- Iteration and verification of AI output\n- Judgment about when to trust vs. correct the AI',
    difficulty: 'Mid',
    timeLimitMin: 90,
  };
  if (SANDBOX) { console.log(`[AI SANDBOX] generateWorkSampleTask | ${input.jobTitle}`); return template; }
  const system = `You design realistic, fair work-sample tasks for hiring at Lightspeed Systems (K-12 edtech). A single task measures BOTH work quality AND AI skill: the candidate does real role work and shows the prompts/iterations they used. Return ONLY JSON with keys: brief (the task the candidate sees, ~1-2 hours, concrete and role-specific), showYourWorkInstructions, scoringGuideWork (newline "- " bullets grading work quality), scoringGuideAi (newline "- " bullets grading AI skill), difficulty ("Entry"|"Mid"|"Senior"), timeLimitMin (integer minutes).`;
  const user = `Role: ${input.jobTitle} in ${input.department}.${input.jdSummary ? `\nSummary: ${input.jdSummary}` : ''}${input.workSampleInstructions ? `\nDraft work sample idea from the JD: ${input.workSampleInstructions}` : ''}\n\nAuthor a net-new work sample task specific to THIS role.`;
  try {
    const t = JSON.parse(await callClaude(system, user));
    const difficulty = (['Entry', 'Mid', 'Senior'].includes(t.difficulty) ? t.difficulty : 'Mid') as 'Entry' | 'Mid' | 'Senior';
    return {
      brief: t.brief || template.brief,
      showYourWorkInstructions: t.showYourWorkInstructions || template.showYourWorkInstructions,
      scoringGuideWork: t.scoringGuideWork || template.scoringGuideWork,
      scoringGuideAi: t.scoringGuideAi || template.scoringGuideAi,
      difficulty,
      timeLimitMin: Number.isFinite(t.timeLimitMin) ? t.timeLimitMin : 90,
    };
  } catch (err) { console.error('[AI] generateWorkSampleTask failed:', err); return template; }
}

// The FIXED standard question set — asked of EVERY candidate for a role (the "70%").
// The tailored ~30% is NOT generated here; it is curated and emailed to the
// interviewer later, after the candidate's EPP/values are reviewed.
export function standardQuestionSet(department: string): InterviewQuestion[] {
  return [
    { category: 'Standard', question: 'Walk me through your background and what drew you to this role.', rationale: 'Consistent opener across candidates.' },
    { category: 'Standard', question: 'Tell me about a time you owned a difficult problem end to end.', rationale: 'Ownership — a Lightspeed value.' },
    { category: 'Standard', question: 'Describe a time you collaborated across teams to ship something.', rationale: 'Collaboration.' },
    { category: 'Standard', question: 'Tell me about a time you received tough feedback and what you did with it.', rationale: 'Coachability.' },
    { category: 'Standard', question: `What does great work look like in a ${department} role, and how do you measure it?`, rationale: 'Role calibration — same for every candidate.' },
    { category: 'Values', question: 'How do you keep the customer — educators and students — in mind day to day?', rationale: 'Customer focus.' },
    { category: 'Behavioral', question: 'Tell me about a time you had to move fast with incomplete information.', rationale: 'Drive / adaptability.' },
  ];
}

// Generate the fixed standard set for a NEW/changed role via Claude (falls back to
// the canonical set). Candidate-agnostic — no tailored 30%.
export async function generateStandardQuestions(input: {
  department: string; jobTitle: string;
  jdSummary?: string; jdResponsibilities?: string; jdQualifications?: string;
}): Promise<InterviewQuestion[]> {
  if (SANDBOX) { console.log(`[AI SANDBOX] generateStandardQuestions | ${input.jobTitle}`); return standardQuestionSet(input.department); }
  const system = `You are an expert interviewer at Lightspeed Systems (K-12 edtech). Core values: ${LIGHTSPEED_VALUES.join(', ')}. Generate ONLY the FIXED standard interview question set asked of EVERY candidate for this role (the "70%"). Curate them from the job description provided. Do NOT include candidate-specific or tailored questions — those are added later. Keep them role-appropriate but candidate-agnostic. Return ONLY a JSON array; each item {category ("Standard"|"Values"|"Behavioral"), question, rationale}. 7–9 questions.`;
  const jd = [
    input.jdSummary ? `Summary: ${input.jdSummary}` : '',
    input.jdResponsibilities ? `Responsibilities:\n${input.jdResponsibilities}` : '',
    input.jdQualifications ? `Required qualifications:\n${input.jdQualifications}` : '',
  ].filter(Boolean).join('\n\n');
  const user = `Role: ${input.jobTitle} in ${input.department}.${jd ? `\n\nJob description:\n${jd}` : ''}\n\nWrite the standard question set curated from this description.`;
  try { return JSON.parse(await callClaude(system, user)) as InterviewQuestion[]; }
  catch (err) { console.error('[AI] generateStandardQuestions failed:', err); return standardQuestionSet(input.department); }
}

// ============================================================
// TRANSITION PLAN (internal-move offer addendum) — AI DRAFT only.
// The offer letter itself stays a deterministic template; only this
// optional addendum body is AI-drafted for HR to edit. Never final.
// ============================================================

export interface TransitionPlanInput {
  firstName: string;
  lastName: string;
  currentTitle?: string | null;
  currentDepartment?: string | null;
  currentManager?: string | null;
  newTitle: string;
  newDepartment?: string | null;
  newManager?: string | null;
  effectiveDate?: string | null;
}

function placeholderTransitionPlan(input: TransitionPlanInput): string {
  const cur = input.currentTitle ?? 'the current role';
  const nw = input.newTitle ?? 'the new role';
  return [
    `Transition from ${cur} to ${nw}${input.effectiveDate ? ` effective ${input.effectiveDate}` : ''}.`,
    `Document and hand off current responsibilities and active projects to the current manager or a designated backfill.`,
    `Hold knowledge-transfer sessions with the current team during a ~two-week overlap period.`,
    `Introduce the employee to the new team and manager, and set new-role goals for the first 30 days.`,
    `Confirm access, tools, and system permissions for the new role before the effective date.`,
  ].join('\n');
}

export async function draftTransitionPlan(
  input: TransitionPlanInput
): Promise<{ text: string; mode: 'ai' | 'sandbox' }> {
  if (SANDBOX) {
    console.log('[AI SANDBOX] draftTransitionPlan | placeholder (no ANTHROPIC_API_KEY)');
    return { text: placeholderTransitionPlan(input), mode: 'sandbox' };
  }

  const system = `You are helping an HR team draft a short, practical TRANSITION PLAN for an internal
employee moving to a new role. Write a concise plan of 4-6 short plain-text lines (one item per line,
no markdown headers or bullet characters) covering: handoff of current responsibilities, knowledge
transfer, a reasonable overlap/transition period, introductions and first-30-days goals in the new role,
and access/tooling for the new role. Keep it neutral and professional. Do NOT invent specific names,
dates, salary figures, or facts not provided — use general phrasing like "the current manager" or
"the effective date" where specifics are unknown. This is a DRAFT for HR to review and edit, not final.`;

  const user = `Employee: ${input.firstName} ${input.lastName}
Current role: ${input.currentTitle ?? 'unknown'}${input.currentDepartment ? ', ' + input.currentDepartment : ''}
Current manager: ${input.currentManager ?? 'unknown'}
New role: ${input.newTitle}${input.newDepartment ? ', ' + input.newDepartment : ''}
New manager: ${input.newManager ?? 'unknown'}
Effective date: ${input.effectiveDate ?? 'not set'}`;

  try {
    const raw = await callClaude(system, user);
    return { text: raw.trim(), mode: 'ai' };
  } catch (err) {
    console.error('[AI] draftTransitionPlan failed — returning placeholder:', err);
    return { text: placeholderTransitionPlan(input), mode: 'sandbox' };
  }
}


// ============================================================
// SKILLS FIT — grades how well a resume evidences the ROLE'S key
// skills, 0–100. Distinct from the required-qualifications gate
// (which is a pass/fail knockout): skills-fit is a GRADED signal
// used to inform — not solely gate — the combined screen. It only
// considers job-relevant skills. Scores are provisional (see module
// notes): calibrate before letting them drive real decisions.
// ============================================================

const SKILLS_FIT_MODEL = 'claude-sonnet-4-6';

export interface SkillCheck {
  skill: string;
  rating: number;
  evidence: string;
}

export interface SkillsFitResult {
  score: number;
  skills: SkillCheck[];
  summary: string;
  mode: 'ai' | 'keyword';
}

interface SkillsFitJobInput {
  jobTitle?: string;
  summary?: string | null;
  responsibilities?: string | null;
  requiredQualifications?: string | null;
  preferredQualifications?: string | null;
}

function summarizeSkillsFit(skills: SkillCheck[], mode: 'ai' | 'keyword'): SkillsFitResult {
  if (skills.length === 0) {
    return { score: 0, skills: [], summary: 'No role skills could be derived from the job description — nothing to score.', mode };
  }
  const score = Math.round(skills.reduce((s, c) => s + (Number.isFinite(c.rating) ? c.rating : 0), 0) / skills.length);
  const strong = skills.filter((s) => s.rating >= 70).map((s) => s.skill);
  const weak = skills.filter((s) => s.rating < 40).map((s) => s.skill);
  const parts = [`Skills fit: ${score}/100 across ${skills.length} role skills.`];
  if (strong.length) parts.push(`Strong: ${strong.join(', ')}.`);
  if (weak.length) parts.push(`Weak/absent: ${weak.join(', ')}.`);
  return { score, skills, summary: parts.join(' '), mode };
}

function keywordSkillsFit(job: SkillsFitJobInput, resumeText: string): SkillsFitResult {
  const jdText = [job.jobTitle, job.summary, job.responsibilities, job.requiredQualifications, job.preferredQualifications]
    .filter(Boolean).join('\n');
  const terms = Array.from(new Set(
    jdText.toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  )).slice(0, 8);
  const hay = resumeText.toLowerCase();
  const skills: SkillCheck[] = terms.map((t) => {
    const hit = hay.includes(t);
    return { skill: t, rating: hit ? 75 : 25, evidence: hit ? 'Term appears in resume.' : 'Term not found in resume.' };
  });
  return summarizeSkillsFit(skills, 'keyword');
}

export async function scoreSkillsFit(resumeText: string, job: SkillsFitJobInput): Promise<SkillsFitResult> {
  if (!resumeText || resumeText.trim().length < 20) {
    return { score: 0, skills: [], summary: 'No resume text provided — skills fit not scored.', mode: 'keyword' };
  }
  if (SANDBOX) {
    console.log('[AI SANDBOX] scoreSkillsFit | keyword fallback (no ANTHROPIC_API_KEY)');
    return keywordSkillsFit(job, resumeText);
  }

  const system = `You assess how well a candidate's resume evidences the KEY SKILLS a role needs.
Step 1: from the job information, infer the 5–8 most important, job-relevant skills for the role
(technical and functional; ignore generic soft-skill filler and anything not tied to the work).
Step 2: for EACH skill, rate 0–100 how strongly the resume shows real evidence the candidate has it,
citing where. Be evidence-based and fair: absence of evidence is a low rating, not zero unless nothing relates.
Do NOT reject or make a hire/no-hire judgement — output only per-skill ratings.
Return ONLY a JSON array. Each element:
  { "skill": "<short skill name>", "rating": <0-100 integer>, "evidence": "<short reason / where found>" }`;

  const user = `JOB TITLE: ${job.jobTitle ?? '(unspecified)'}
SUMMARY: ${job.summary ?? ''}
RESPONSIBILITIES: ${job.responsibilities ?? ''}
REQUIRED QUALIFICATIONS: ${job.requiredQualifications ?? ''}
PREFERRED QUALIFICATIONS: ${job.preferredQualifications ?? ''}

RESUME:
${resumeText}`;

  try {
    const raw = await callClaude(system, user, SKILLS_FIT_MODEL);
    const parsed = JSON.parse(extractJsonArray(raw)) as SkillCheck[];
    const skills: SkillCheck[] = (Array.isArray(parsed) ? parsed : [])
      .filter((p) => p && typeof p.skill === 'string')
      .map((p) => ({
        skill: String(p.skill).trim(),
        rating: Math.max(0, Math.min(100, Math.round(Number(p.rating) || 0))),
        evidence: String(p.evidence ?? ''),
      }));
    return summarizeSkillsFit(skills, 'ai');
  } catch (err) {
    console.error('[AI] scoreSkillsFit failed — falling back to keyword skills fit:', err);
    return keywordSkillsFit(job, resumeText);
  }
}

// ── Capability scorecard recommendation ────────────────────
// Suggests a 1-5 score per Capability category from the candidate's
// interview feedback. Sandbox-safe: returns a labelled placeholder when
// no ANTHROPIC_API_KEY is set.

export interface CapabilityRecInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  items: Array<{ id: string; name: string; teachability: string; description?: string | null }>;
  interviewFeedback: string;
}
export interface CapabilityRecItem { capabilityItemId: string; score: number; rationale: string; }
export interface CapabilityRecResult { mode: 'ai' | 'placeholder'; items: CapabilityRecItem[]; }

const TEACHABILITY_LABEL: Record<string, string> = {
  hard_to_teach: 'hard to teach',
  compound: 'compound',
  learnable: 'learnable',
};

function placeholderCapabilityRec(input: CapabilityRecInput): CapabilityRecResult {
  return {
    mode: 'placeholder',
    items: input.items.map((it) => ({
      capabilityItemId: it.id,
      score: 3,
      rationale: `Sandbox draft (no scoring model connected). "${it.name}" is ${TEACHABILITY_LABEL[it.teachability] ?? it.teachability}. Connect a model to get a suggestion grounded in the interview notes.`,
    })),
  };
}

export async function recommendCapabilityScores(input: CapabilityRecInput): Promise<CapabilityRecResult> {
  if (!input.items.length) return { mode: 'placeholder', items: [] };

  if (SANDBOX) {
    console.log('[AI SANDBOX] recommendCapabilityScores | placeholder draft (no ANTHROPIC_API_KEY)');
    return placeholderCapabilityRec(input);
  }

  const system = `You are helping a hiring team at Lightspeed Systems (K-12 edtech) suggest a 1-5 score for each CAPABILITY category on a candidate scorecard, based ONLY on the interview feedback provided.
Scale: 1 = major concern, 2 = below the bar, 3 = meets the bar, 4 = strong, 5 = outstanding.
Cite the feedback for each score. Do NOT invent evidence and do NOT speculate about protected characteristics.
Each category carries a teachability code (hard_to_teach / compound / learnable): weigh gaps in hard-to-teach categories more heavily, and be more forgiving of gaps in learnable ones.
If the feedback says little about a category, suggest 3 and note that the evidence is thin.
This is an AI draft to inform a human reviewer — never a final decision.
Return ONLY JSON: { "items": [ { "id": "<the exact id given>", "score": 1-5, "rationale": "one line citing the feedback" } ] }`;

  const itemList = input.items
    .map((it) => `- id=${it.id} | ${it.name} (${it.teachability})${it.description ? ` — ${it.description}` : ''}`)
    .join('\n');

  const user = `Candidate: ${input.firstName} ${input.lastName}
Role: ${input.jobTitle ?? 'Unknown'}

--- CAPABILITY CATEGORIES (score each) ---
${itemList}

--- INTERVIEW FEEDBACK ---
${input.interviewFeedback || '(no interview feedback on file yet)'}`;

  try {
    const raw = await callClaude(system, user);
    const fenced = raw.replace(/```json|```/g, '');
    const parsed = JSON.parse(fenced.slice(fenced.indexOf('{'), fenced.lastIndexOf('}') + 1));
    const clamp = (n: any) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));
    const byId: Record<string, { score: number; rationale: string }> = {};
    if (Array.isArray(parsed.items)) {
      parsed.items.forEach((r: any) => {
        if (r && typeof r.id === 'string') byId[r.id] = { score: clamp(r.score), rationale: String(r.rationale ?? '') };
      });
    }
    return {
      mode: 'ai',
      items: input.items.map((it) => ({
        capabilityItemId: it.id,
        score: byId[it.id]?.score ?? 3,
        rationale: byId[it.id]?.rationale ?? 'No specific evidence in the feedback — suggested a neutral 3.',
      })),
    };
  } catch (err) {
    console.error('[AI] recommendCapabilityScores failed — returning placeholder:', err);
    return placeholderCapabilityRec(input);
  }
}

// ============================================================
// CANDIDATE RANKING (advisory) — order the pool against a role.
// Never a decision, never an exclusion. Personality/EPP is deliberately
// NOT used here (that stays a separate, human-reviewed step). The fitScore
// is internal ordering only and is never shown to users.
// ============================================================

const RANKING_MODEL = 'claude-sonnet-4-6';

export interface RankFitInput {
  firstName: string;
  lastName: string;
  roleTitle: string;
  criteria: string;
  candidateMaterial: string;
}

export interface RankFitResult {
  sortScore: number;
  recommendation: string;
  strengths: string[];
  concerns: string[];
  model: string;
}

function placeholderRankFit(_input: RankFitInput): RankFitResult {
  return {
    sortScore: 60,
    recommendation: 'Sandbox draft — connect an AI key to rank against the role.',
    strengths: ['Resume received and readable.'],
    concerns: ['Sandbox draft, not a real evaluation.'],
    model: 'placeholder',
  };
}

export async function rankCandidateFit(input: RankFitInput): Promise<RankFitResult> {
  if (SANDBOX) {
    console.log('[AI SANDBOX] rankCandidateFit | placeholder (no ANTHROPIC_API_KEY)');
    return placeholderRankFit(input);
  }

  const system = `You are ranking ONE candidate's fit for a role for a hiring team at Lightspeed Systems (K-12 edtech).
Judge ONLY role fit: the role brief plus what the hiring manager said they want, against the candidate's background.
Do NOT use or infer personality, protected characteristics, or demographics. This is an ADVISORY suggestion to help a
human decide what order to review candidates in — never a decision, never an exclusion.
Give an internal fitScore 0-100 used only to order candidates (it is NOT shown to anyone), a one-line recommendation,
a few concrete strengths, and a few things to probe in the interview. Ground every point in the candidate's material.
If the role brief is thin, say what's missing and keep your confidence low.
Return ONLY JSON: { "fitScore": 0-100, "recommendation": "one line", "strengths": ["..."], "concerns": ["..."] }`;

  const user = `ROLE: ${input.roleTitle}

--- WHAT THIS ROLE NEEDS (job description + hiring-manager intent) ---
${input.criteria || 'not provided'}

--- CANDIDATE: ${input.firstName} ${input.lastName} ---
${input.candidateMaterial || '(no resume on file)'}`;

  try {
    const meta = await callClaudeMeta(system, user, RANKING_MODEL);
    const fenced = meta.text.replace(/```json|```/g, '');
    const parsed = JSON.parse(fenced.slice(fenced.indexOf('{'), fenced.lastIndexOf('}') + 1));
    const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    return {
      sortScore: clamp(parsed.fitScore),
      recommendation: String(parsed.recommendation ?? ''),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 5) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 5) : [],
      model: meta.model,
    };
  } catch (err) {
    console.error('[AI] rankCandidateFit failed — returning placeholder:', err);
    return placeholderRankFit(input);
  }
}
