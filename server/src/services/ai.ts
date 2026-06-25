// ============================================================
// AI SERVICE — Interview question generation + post-interview
// feedback analysis using Claude (Anthropic API).
//
// SANDBOX MODE: when ANTHROPIC_API_KEY is not set, all calls
// log to console and return mock data. No real API calls.
// ============================================================

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

export interface InterviewFeedback {
  interviewScore: number;          // 0–100
  feedbackHr: string;              // full report for hiring manager
  feedbackCandidate: string;       // candidate-facing summary
}

// ── Core Claude caller ─────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
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
  return data.content[0].text as string;
}

// ── Question generation ────────────────────────────────────

interface QuestionGenInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  eppProfile?: any;           // raw EPP result from Criteria Corp
  eppValuesMatchScore?: number | null;
  resumeReviewNotes?: string | null;
  resumeReviewScore?: number | null;
  referenceCheckNotes?: string | null;
  referenceCheckScore?: number | null;
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

  const system = `You are an expert HR interviewer at Lightspeed Systems, a K-12 edtech company.
Your job is to generate a set of targeted interview questions for a specific candidate based on their
assessment results, resume review, and reference checks.

Lightspeed's core values: ${LIGHTSPEED_VALUES.join(', ')}.

Return a JSON array of questions. Each question must have:
- "category": one of "EPP/Values", "Resume", "References", "Role-Specific", "Behavioral"
- "question": the interview question text
- "rationale": 1–2 sentences explaining why this question is relevant for this candidate

Aim for 10–14 questions total. Prioritize areas that showed weaknesses or needed probing.
Return ONLY the JSON array, no other text.`;

  const user = `Generate tailored interview questions for:

Candidate: ${input.firstName} ${input.lastName}
Role: ${input.jobTitle ?? 'Unknown'}
CCAT Score: ${input.ccatScore ?? 'N/A'}
Work Sample Score: ${input.workSampleScore ?? 'N/A'}
EPP Values Match Score: ${input.eppValuesMatchScore ?? 'N/A'}%
EPP Profile: ${input.eppProfile ? JSON.stringify(input.eppProfile) : 'Not available'}

Resume Review Notes (HR):
${input.resumeReviewNotes || 'None provided'}
Resume Review Score: ${input.resumeReviewScore ?? 'N/A'}

Reference Check Notes (HR):
${input.referenceCheckNotes || 'None provided'}
Reference Check Score: ${input.referenceCheckScore ?? 'N/A'}`;

  try {
    const raw = await callClaude(system, user);
    const questions = JSON.parse(raw) as InterviewQuestion[];
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
  referenceCheckScore?: number | null;
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

  const system = `You are an expert HR analyst at Lightspeed Systems reviewing a candidate interview.
You will receive a Zoom transcript and the list of questions that were supposed to be asked.
Produce two outputs: a detailed hiring manager report and a candidate-facing feedback summary.

Lightspeed's core values: ${LIGHTSPEED_VALUES.join(', ')}.`;

  const user = `Analyze this interview for ${input.firstName} ${input.lastName}, applying for ${input.jobTitle ?? 'Unknown'}.

Prior scores:
- CCAT: ${input.ccatScore ?? 'N/A'}
- EPP Values Match: ${input.eppValuesMatchScore ?? 'N/A'}%
- Work Sample: ${input.workSampleScore ?? 'N/A'}
- Resume Review: ${input.resumeReviewScore ?? 'N/A'}
- Reference Check: ${input.referenceCheckScore ?? 'N/A'}

Planned interview questions:
${questionList}

Interview transcript:
${input.transcript || 'No transcript available.'}

Return a JSON object with:
{
  "interviewScore": <integer 0-100>,
  "feedbackHr": "<full hiring manager report — include: overall assessment, what went well, what didn't, which questions were asked vs missed, which questions the candidate didn't fully answer, recommendation>",
  "feedbackCandidate": "<candidate-facing summary — professional, constructive, positive where warranted, specific on growth areas, no internal scoring details>"
}

Return ONLY the JSON object, no other text.`;

  try {
    const raw = await callClaude(system, user);
    const feedback = JSON.parse(raw) as InterviewFeedback;
    return feedback;
  } catch (err) {
    console.error('[AI] analyzeInterviewTranscript failed:', err);
    return getMockFeedback(input);
  }
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
  };
}
