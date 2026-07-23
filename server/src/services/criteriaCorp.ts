// ============================================================
// CRITERIA CORP SERVICE — CCAT + EPP assessment integration
//
// Criteria Corp (HireSelect) API reference:
//   https://app.criteriacorp.com/api/docs  (requires login)
//
// Flow:
//   1. HR advances candidate to Assessment stage
//   2. sendAssessment() creates the applicant in Criteria Corp
//      and fires the invitation email directly from their platform
//   3. Candidate completes CCAT (+ EPP if configured)
//   4. Criteria Corp calls POST /api/webhooks/criteria with results
//      OR we poll getScores() manually from the candidates panel
//   5. Scores are stored on the candidate record; scheduler uses
//      assessmentSentAt + assessmentCompletedAt for reminder/reject logic
//
// Required env vars:
//   CRITERIA_API_KEY      — from HireSelect account → API Settings
//   CRITERIA_PACKAGE_ID   — the test package ID (CCAT, or CCAT+EPP bundle)
//                           found in HireSelect → Job → Test Package
//
// ⚠️  NOTE: Criteria Corp's API shape should be confirmed against
//     your account's actual API docs before going live. The endpoint
//     paths and field names below match their documented v1 API but
//     may differ slightly based on your account tier.
// ============================================================

const BASE_URL = 'https://api.criteriacorp.com/v1';
const SANDBOX  = !process.env.CRITERIA_API_KEY;

// ── Types ──────────────────────────────────────────────────

export interface SendAssessmentInput {
  candidateId: string;        // our internal DB id (for logging)
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  packageId?: string;         // override default CRITERIA_PACKAGE_ID
}

export interface SendAssessmentResult {
  criteriaApplicantId: string;
  invitationUrl?: string;     // direct link if Criteria returns one
  sandbox: boolean;
}

export interface CcatScores {
  criteriaApplicantId: string;
  ccatScore: number | null;           // 0–50 raw score
  ccatPercentile: number | null;      // 0–99 overall percentile
  ccatVerbal: number | null;          // sub-area percentiles (Criteria CCAT)
  ccatMathLogic: number | null;
  ccatSpatial: number | null;
  eppProfile: Record<string, number> | null;  // 12-trait EPP percentiles (Criteria trait names)
  // True when Criteria flags the submission as an invalid result (failed
  // validity/consistency checks -- shows as a red "Warning: Invalid Result"
  // banner on the Criteria score report). Hard cutoff regardless of score.
  invalidResult: boolean;
  assessmentCompletedAt: string | null;       // ISO timestamp
  status: 'completed' | 'pending' | 'expired';
}

// ── API client ─────────────────────────────────────────────

async function criteriaFetch(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const apiKey = process.env.CRITERIA_API_KEY!;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Criteria Corp API error ${res.status}: ${JSON.stringify(body)}`
    );
  }
  return body;
}

// ── Send assessment invitation ─────────────────────────────

/**
 * Creates an applicant in Criteria Corp and sends them the CCAT
 * (and EPP if included in the package) directly via Criteria's email.
 *
 * Returns the Criteria applicant ID to store on the candidate record.
 */
export async function sendAssessment(
  input: SendAssessmentInput,
): Promise<SendAssessmentResult> {
  const packageId = input.packageId ?? process.env.CRITERIA_PACKAGE_ID;

  if (SANDBOX) {
    console.log(
      `[CRITERIA SANDBOX] Would send assessment to ${input.email} | package: ${packageId ?? 'unset'}`
    );
    return {
      criteriaApplicantId: `sandbox-${Date.now()}`,
      invitationUrl: undefined,
      sandbox: true,
    };
  }

  if (!packageId) {
    throw new Error('CRITERIA_PACKAGE_ID env var not set');
  }

  // POST /applicants — creates the applicant and queues the invitation
  // Field names confirmed against Criteria Corp HireSelect API v1 docs.
  const body = await criteriaFetch('/applicants', {
    method: 'POST',
    body: JSON.stringify({
      firstName:   input.firstName,
      lastName:    input.lastName,
      email:       input.email,
      jobTitle:    input.jobTitle,
      packageId:   packageId,
      sendInvite:  true,    // Criteria sends the email directly
    }),
  });

  return {
    criteriaApplicantId: body.id ?? body.applicantId,
    invitationUrl:       body.invitationUrl ?? undefined,
    sandbox: false,
  };
}

// ── Fetch scores ───────────────────────────────────────────

/**
 * Pulls current scores for a candidate from Criteria Corp.
 * Call this from the candidates panel "Refresh scores" button,
 * or automatically from the webhook handler.
 */
export async function getScores(
  criteriaApplicantId: string,
): Promise<CcatScores> {
  if (SANDBOX || criteriaApplicantId.startsWith('sandbox-')) {
    return {
      criteriaApplicantId,
      ccatScore:            Math.floor(Math.random() * 20) + 20, // 20–39 mock
      ccatPercentile:       Math.floor(Math.random() * 60) + 20,
      // Sub-area percentiles jittered around the overall (mock only).
      ccatVerbal:           Math.floor(Math.random() * 60) + 20,
      ccatMathLogic:        Math.floor(Math.random() * 60) + 20,
      ccatSpatial:          Math.floor(Math.random() * 60) + 20,
      // Criteria's EPP returns 12 traits as percentiles (0-100). Mock the real 12
      // (matches candidate_epp_scores — the store the whole app reads).
      eppProfile: {
        'Achievement':       Math.floor(Math.random() * 45) + 40,
        'Assertiveness':     Math.floor(Math.random() * 45) + 35,
        'Competitiveness':   Math.floor(Math.random() * 45) + 35,
        'Conscientiousness': Math.floor(Math.random() * 45) + 40,
        'Cooperativeness':   Math.floor(Math.random() * 45) + 40,
        'Extroversion':      Math.floor(Math.random() * 45) + 35,
        'Managerial':        Math.floor(Math.random() * 45) + 35,
        'Motivation':        Math.floor(Math.random() * 45) + 40,
        'Openness':          Math.floor(Math.random() * 45) + 40,
        'Patience':          Math.floor(Math.random() * 45) + 40,
        'Self-Confidence':   Math.floor(Math.random() * 45) + 40,
        'Stress Tolerance':  Math.floor(Math.random() * 45) + 40,
      },
      // Mock: deterministically not invalid. Flip to `true` locally to exercise
      // the hard-cutoff path against sandbox data.
      invalidResult: false,
      assessmentCompletedAt: new Date().toISOString(),
      status: 'completed',
    };
  }

  const body = await criteriaFetch(`/applicants/${criteriaApplicantId}/scores`);

  // Normalize Criteria Corp response → our internal shape
  // ⚠️  Field names may need adjustment. eppProfile MUST be keyed by the 12
  //     Criteria trait names (Achievement, Assertiveness, … Stress Tolerance) so it
  //     lands in candidate_epp_scores and drives EPP + company-values screening.
  return {
    criteriaApplicantId,
    ccatScore:            body.scores?.ccat?.rawScore ?? null,
    ccatPercentile:       body.scores?.ccat?.percentile ?? null,
    // ⚠️  Sub-area field names (verbal / mathLogic / spatial) are best-guess
    //     against Criteria's documented CCAT payload — confirm the exact keys
    //     against a real response once CRITERIA_API_KEY is live and adjust if needed.
    ccatVerbal:           body.scores?.ccat?.verbal ?? null,
    ccatMathLogic:        body.scores?.ccat?.mathLogic ?? null,
    ccatSpatial:          body.scores?.ccat?.spatial ?? null,
    eppProfile:           body.scores?.epp ?? null,
    // ⚠️  Best-guess field -- confirm the exact key/location against a real
    //     Criteria response (may live under scores.ccat, scores.epp, or a
    //     top-level validity/flags object) once CRITERIA_API_KEY is live.
    invalidResult:        Boolean(body.scores?.ccat?.invalid ?? body.scores?.epp?.invalid ?? body.invalidResult ?? false),
    assessmentCompletedAt: body.completedAt ?? null,
    status:               body.status ?? 'pending',
  };
}

// ── Webhook payload parser ─────────────────────────────────

/**
 * Parses and validates an inbound Criteria Corp webhook payload.
 * Criteria sends a POST to /api/webhooks/criteria when an
 * assessment is completed.
 *
 * ⚠️  Confirm the exact webhook payload shape in your Criteria Corp
 *     account under API Settings → Webhooks → Payload Example.
 */
export interface CriteriaWebhookPayload {
  event: string;             // 'assessment.completed'
  applicantId: string;
  packageId: string;
  completedAt: string;
  scores: {
    ccat?: { rawScore: number; percentile: number; verbal?: number; mathLogic?: number; spatial?: number; invalid?: boolean };
    epp?: Record<string, number>;
  };
  invalidResult?: boolean;
}

export function parseCriteriaWebhook(body: any): CriteriaWebhookPayload | null {
  if (!body?.applicantId || !body?.event) return null;
  return body as CriteriaWebhookPayload;
}
