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

async function callClaude(systemPrompt: string, userPrompt: string, model: string = MODEL): Promise<string> {
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
    const raw = await callClaude(system, user, RESUME_SCREEN_MODEL);
    const parsed = JSON.parse(extractJsonArray(raw)) as RequirementCheck[];
    // Normalize + guard against the model dropping/renaming items.
    const checks: RequirementCheck[] = requirements.map((req) => {
      const hit = parsed.find((p) => p && typeof p.requirement === 'string'
        && p.requirement.trim().toLowerCase().slice(0, 40) === req.trim().toLowerCase().slice(0, 40));
      if (hit) return { requirement: req, met: !!hit.met, evidence: String(hit.evidence ?? '') };
      return { requirement: req, met: false, evidence: 'Not assessed by the model — treat as unverified.' };
    });
    return summarizeScreen(checks);
  } catch (err) {
    console.error('[AI] screenResumeRequirements failed — falling back to keyword screen:', err);
    return keywordScreen(requirements, resumeText);
  }
}


// ============================================================
// REFERENCE CHECK — agent that assembles a balanced reference
// report (good signals + concerns) for a finalist, to inform the
// offer decision. Runs after the interview, before the offer.
//
// IMPORTANT (compliance): this does NOT scrape the open web for a
// real named person. Automated background/reference research is a
// regulated activity (consent / FCRA-style rules, accuracy, and
// defamation risk) and must clear the security/legal review before
// it runs against real applicants. This function synthesizes a
// structured report from the information the app already holds and
// is clearly marked as an AI draft to verify. `fetchReferenceSource`
// is the seam where a compliant provider / candidate-supplied
// references / (post-legal-review) search tool plugs in later.
// ============================================================

const REFERENCE_MODEL = 'claude-sonnet-4-6';

export interface ReferenceCheckInput {
  firstName: string;
  lastName: string;
  jobTitle?: string;
  linkedinUrl?: string | null;
  notes?: string | null;
  interviewFeedbackHr?: string | null;
  interviewScore?: number | null;
  // Optional external material from a compliant reference source (empty for now).
  externalReferenceMaterial?: string | null;
}

export interface ReferenceCheckResult {
  positives: string[];
  concerns: string[];
  summary: string;
  recommendation: 'proceed' | 'proceed_with_caution' | 'flag_for_review';
  confidence: number;               // 0–100, how well-supported the report is
  mode: 'ai' | 'placeholder';       // 'placeholder' = sandbox/no-key draft
}

// Seam for a real reference source. Returns null today (no external
// research performed). A compliant provider or candidate-provided
// references get wired in here later.
async function fetchReferenceSource(_input: ReferenceCheckInput): Promise<string | null> {
  return null;
}

function placeholderReference(input: ReferenceCheckInput): ReferenceCheckResult {
  const name = `${input.firstName} ${input.lastName}`.trim();
  return {
    positives: [
      `Interview signal on file for ${name}${input.interviewScore != null ? ` (interview score ${input.interviewScore})` : ''}.`,
      'No negative signals in the information currently on file.',
    ],
    concerns: [
      'No verified external references gathered yet — connect a reference source to populate this.',
    ],
    summary:
      'Draft reference report generated from on-file data only. No external references were gathered. Verify with real references before relying on this.',
    recommendation: 'proceed_with_caution',
    confidence: 20,
    mode: 'placeholder',
  };
}

export async function runReferenceCheck(input: ReferenceCheckInput): Promise<ReferenceCheckResult> {
  const external = await fetchReferenceSource(input);

  if (SANDBOX) {
    console.log('[AI SANDBOX] runReferenceCheck | placeholder draft (no ANTHROPIC_API_KEY)');
    return placeholderReference(input);
  }

  const system = `You are assisting an HR team with a reference-check summary for a job finalist,
run after their interview and before an offer. Produce a BALANCED report: genuine positive signals
AND any concerns, but only from the material provided. Do NOT invent references, employers, or facts,
and do NOT speculate about protected characteristics. If there is little material, say so and keep
confidence low. This is an AI draft to be verified with real references — never a final background check.
Return ONLY JSON:
{
  "positives": ["..."],
  "concerns": ["..."],
  "summary": "2-3 sentences",
  "recommendation": "proceed" | "proceed_with_caution" | "flag_for_review",
  "confidence": 0-100
}`;

  const user = `Finalist: ${input.firstName} ${input.lastName}
Role: ${input.jobTitle ?? 'Unknown'}
LinkedIn: ${input.linkedinUrl || 'not provided'}
Interview score: ${input.interviewScore ?? 'N/A'}
Interview feedback (HR): ${input.interviewFeedbackHr || 'none on file'}
Recruiter notes: ${input.notes || 'none'}
External reference material: ${external || 'none gathered (no compliant reference source connected yet)'}`;

  try {
    const raw = await callClaude(system, user, REFERENCE_MODEL);
    const fenced = raw.replace(/```json|```/g, '');
    const start = fenced.indexOf('{');
    const end = fenced.lastIndexOf('}');
    const parsed = JSON.parse(fenced.slice(start, end + 1));
    return {
      positives: Array.isArray(parsed.positives) ? parsed.positives.map(String) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
      summary: String(parsed.summary ?? ''),
      recommendation: ['proceed', 'proceed_with_caution', 'flag_for_review'].includes(parsed.recommendation)
        ? parsed.recommendation
        : 'proceed_with_caution',
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      mode: 'ai',
    };
  } catch (err) {
    console.error('[AI] runReferenceCheck failed — returning placeholder:', err);
    return placeholderReference(input);
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
}

function templateJD(title: string, department: string): RoleJD {
  return {
    jobTitle: title,
    summary: `Lightspeed Systems is hiring a ${title} to join our ${department} team. [Draft auto-generated from the intake — review and refine before publishing.]`,
    responsibilities: '- Own key deliverables for the team\n- Collaborate across functions to ship outcomes\n- Bring an ownership mindset to day-to-day work',
    requiredQualifications: `- Relevant experience in ${department}\n- Strong communication and follow-through\n- Alignment with Lightspeed's values`,
    preferredQualifications: '- Prior K-12 or edtech experience\n- Comfort using AI tools in daily work',
    workSampleInstructions: `A short, realistic task that mirrors day-to-day ${department} work (about 1-2 hours). [Draft auto-generated from the intake - review and refine before sending.]`,
  };
}

export async function generateRoleJD(input: {
  department: string; seniority?: string | null; workArrangement?: string | null;
  location?: string | null; salaryMin?: number | null; salaryMax?: number | null;
  baseJd?: { jobTitle: string; summary?: string | null; responsibilities?: string | null; requiredQualifications?: string | null; preferredQualifications?: string | null; workSampleInstructions?: string | null } | null;
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
      };
    }
    return templateJD(title, input.department);
  }
  const system = `You write concise, inclusive job descriptions for Lightspeed Systems, a K-12 edtech company. Core values: ${LIGHTSPEED_VALUES.join(', ')}. Return ONLY JSON with keys: jobTitle, summary, responsibilities, requiredQualifications, preferredQualifications, workSampleInstructions (a short realistic task the candidate would do, ~1-2 hours). The list fields should be short newline-separated bullets using "- ".`;
  const user = input.baseJd
    ? `Here is an existing job description for ${input.baseJd.jobTitle} (${input.department}):
Summary: ${input.baseJd.summary ?? ''}
Responsibilities: ${input.baseJd.responsibilities ?? ''}
Required qualifications: ${input.baseJd.requiredQualifications ?? ''}
Preferred qualifications: ${input.baseJd.preferredQualifications ?? ''}
Work sample task: ${input.baseJd.workSampleInstructions ?? '(none on file)'}

The role should DIFFER from that as follows: ${input.changeNote ?? ''}

Produce the UPDATED job description AND an updated work sample task, reflecting those differences — keep what still applies, change what should change.`
    : `Draft a job description for a ${title} in ${input.department}. Work arrangement: ${input.workArrangement ?? 'On-site'}${input.location ? ', ' + input.location : ''}.${input.salaryMin && input.salaryMax ? ` Salary band $${input.salaryMin}–$${input.salaryMax}.` : ''} Keep it realistic and concise.`;
  try {
    const jd = JSON.parse(await callClaude(system, user));
    return { jobTitle: jd.jobTitle || title, summary: jd.summary || '', responsibilities: jd.responsibilities || '', requiredQualifications: jd.requiredQualifications || '', preferredQualifications: jd.preferredQualifications || '', workSampleInstructions: jd.workSampleInstructions || '' };
  } catch (err) { console.error('[AI] generateRoleJD failed:', err); return input.baseJd ? { jobTitle: input.baseJd.jobTitle, summary: input.baseJd.summary ?? '', responsibilities: input.baseJd.responsibilities ?? '', requiredQualifications: input.baseJd.requiredQualifications ?? '', preferredQualifications: input.baseJd.preferredQualifications ?? '', workSampleInstructions: input.baseJd.workSampleInstructions ?? '' } : templateJD(title, input.department); }
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
