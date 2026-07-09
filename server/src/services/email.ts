// ============================================================
// EMAIL SERVICE — 17 automated hiring pipeline emails
//
// Transport: SendGrid REST API (https://api.sendgrid.com/v3/mail/send),
// called directly via fetch with a Bearer token — mirrors the Dreadnought
// Command Center implementation (server/lib/email.ts / daily-pulse.ts).
// No SDK/package dependency. Migrated from Resend 2026-06-29 (DD: SendGrid swap).
//
// SANDBOX MODE (default): emails are logged to console only.
// No emails are sent, no SendGrid account needed.
//
// TO GO LIVE: set SENDGRID_API_KEY in Railway environment variables
// (and EMAIL_FROM if the default from-address should change).
// All 17 templates will fire automatically on stage changes.
// ============================================================

const SENDGRID_SEND_URL = 'https://api.sendgrid.com/v3/mail/send';
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? 'Lightspeed Systems';
const HR_EMAIL = process.env.HR_EMAIL ?? 'jade.friedman@lsscorp.net';

// ── Core send function ─────────────────────────────────────

interface EmailAttachment {
  content: string;      // base64-encoded
  filename: string;
  type: string;         // MIME type, e.g. 'text/calendar'
  disposition?: string; // 'attachment' (default)
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  templateId: string;
  /** Optional reply-to address; defaults to EMAIL_REPLY_TO when set. */
  replyTo?: string;
  /** Optional attachments (e.g. an .ics calendar invite). */
  attachments?: EmailAttachment[];
}

/** True when a SendGrid key is configured (i.e. emails actually send). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY);
}

/** Current email configuration — used by the admin test surface. */
export function emailConfig() {
  return {
    configured: isEmailConfigured(),
    from: process.env.EMAIL_FROM ?? FROM_ADDRESS,
    fromName: process.env.EMAIL_FROM_NAME ?? FROM_NAME,
    replyTo: process.env.EMAIL_REPLY_TO ?? null,
  };
}

function buildSendGridBody(payload: EmailPayload) {
  const replyTo = payload.replyTo ?? process.env.EMAIL_REPLY_TO;
  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: payload.to }] }],
    from: { email: process.env.EMAIL_FROM ?? FROM_ADDRESS, name: process.env.EMAIL_FROM_NAME ?? FROM_NAME },
    subject: payload.subject,
    content: [{ type: 'text/html', value: payload.html }],
  };
  if (replyTo) body.reply_to = { email: replyTo };
  if (payload.attachments && payload.attachments.length) {
    body.attachments = payload.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: a.type,
      disposition: a.disposition ?? 'attachment',
    }));
  }
  return body;
}

/**
 * Send an email and THROW on failure. Returns { sandbox } so callers (e.g. the
 * admin test form) can tell the user whether it really went out or was logged.
 */
export async function sendEmailOrThrow(payload: EmailPayload): Promise<{ sandbox: boolean }> {
  if (!isEmailConfigured()) {
    console.log(`[EMAIL SANDBOX] Template: ${payload.templateId} | To: ${payload.to} | Subject: ${payload.subject}`);
    return { sandbox: true };
  }
  const response = await fetch(SENDGRID_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildSendGridBody(payload)),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SendGrid rejected email (${response.status}): ${text || response.statusText}`);
  }
  return { sandbox: false };
}

/**
 * Fire-and-forget send used by the automated pipeline emails. Never throws —
 * logs and continues so a delivery hiccup cannot break a stage transition.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    await sendEmailOrThrow(payload);
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send ${payload.templateId} to ${payload.to}:`, err);
  }
}

// ── Shared HTML wrapper ────────────────────────────────────

function wrap(body: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a;">
      <img src="https://lightspeedsystems.com/wp-content/uploads/lightspeed-logo.png" alt="Lightspeed Systems" style="height: 32px; margin-bottom: 32px;" />
      ${body}
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />
      <p style="font-size: 12px; color: #888;">Lightspeed Systems · 3825 S Capital of Texas Hwy, Austin, TX 78704</p>
    </div>
  `;
}

function p(text: string) {
  return `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${text}</p>`;
}

function h1(text: string) {
  return `<h1 style="font-size: 22px; font-weight: 600; margin: 0 0 24px;">${text}</h1>`;
}

function button(text: string, url: string) {
  return `<a href="${url}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500; margin: 8px 0 24px;">${text}</a>`;
}

// Escape plain text for safe insertion into an HTML email body.
function esc(t: string): string {
  return (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Candidate data shape ───────────────────────────────────

interface CandidateEmailData {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
  fromStage?: string;
  rejectionReason?: string;
  assessmentLink?: string;
  workSampleInstructions?: string;
  workSampleUrl?: string;
  interviewDate?: string;
  interviewerName?: string;
  interviewerEmail?: string;
  offerDetails?: string;
}

// ============================================================
// THE 17 TEMPLATES
// ============================================================

// ── CANDIDATE-FACING (9 emails) ────────────────────────────

// 1. Application received
export async function emailApplicationReceived(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'application_received',
    subject: `We received your application — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Thanks for applying!')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`We received your application for <strong>${data.jobTitle ?? 'the position'}</strong> at Lightspeed Systems. Our team will review it and be in touch within a few business days.`)}
      ${p('In the meantime, feel free to learn more about us at <a href="https://lightspeedsystems.com">lightspeedsystems.com</a>.')}
      ${p('Thanks again for your interest in Lightspeed!')}
    `),
  });
}

// 2. Invited to assessment (CCAT + EPP)
export async function emailInvitedToAssessment(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'invited_to_assessment',
    subject: `Next step: Complete your assessment — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('You\'ve been selected for our assessment')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Congratulations — after reviewing your application for <strong>${data.jobTitle ?? 'the position'}</strong>, we'd like to invite you to complete a short cognitive and personality assessment.`)}
      ${p('The assessment takes approximately <strong>30–45 minutes</strong> and covers two components: a cognitive aptitude test and a personality/values profile. There\'s no right or wrong answer on the values section — we just want to understand how you work best.')}
      ${data.assessmentLink ? button('Start Assessment', data.assessmentLink) : p('<em>Your assessment link will be sent separately by our team.</em>')}
      ${p('Please complete it within <strong>5 business days</strong>. If you have any questions, reply to this email.')}
    `),
  });
}

// 3. Assessment passed — invited to work sample
export async function emailInvitedToWorkSample(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'invited_to_work_sample',
    subject: `You're advancing — work sample next — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Great news — you\'re moving forward!')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`You've successfully completed the assessment phase for <strong>${data.jobTitle ?? 'the position'}</strong> — congratulations!`)}
      ${p('The next step is a short work sample that gives us a sense of how you approach real problems. Here are the instructions:')}
      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px 20px; margin: 0 0 20px; font-size: 14px; line-height: 1.6;">
        ${data.workSampleInstructions ?? 'Instructions will be provided by the hiring team.'}
      </div>
      ${data.workSampleUrl ? `<div style="margin: 0 0 20px;"><a href="${data.workSampleUrl}" style="display:inline-block;background:#4FA9D6;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Start your work sample &rarr;</a></div>` : ''}
      ${p('Please submit your work sample within <strong>5 business days</strong>.')}
    `),
  });
}

// 4. Advancing to values review
export async function emailAdvancingToValuesReview(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'advancing_values_review',
    subject: `You're advancing to the next round — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('You\'re moving to the next round')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`We've reviewed your work sample for <strong>${data.jobTitle ?? 'the position'}</strong> and we're excited to let you know you're advancing to the next stage of our process.`)}
      ${p('Our team will be in touch shortly to walk you through what comes next. This stage focuses on how well your values and working style align with the Lightspeed team.')}
      ${p('Thanks for your continued interest — we look forward to connecting soon.')}
    `),
  });
}

// 5. Interview scheduled
export async function emailInterviewScheduled(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'interview_scheduled',
    subject: `Your interview is scheduled — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Your interview is confirmed')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Your interview for <strong>${data.jobTitle ?? 'the position'}</strong> has been scheduled.`)}
      ${data.interviewDate ? p(`<strong>Date & Time:</strong> ${data.interviewDate}`) : ''}
      ${data.interviewerName ? p(`<strong>Interviewer:</strong> ${data.interviewerName}`) : ''}
      ${p('The interview will be conducted via Zoom. You\'ll receive a calendar invite with the meeting link shortly.')}
      ${p('To prepare, we recommend reviewing the role description and thinking about examples from your experience that demonstrate the Lightspeed values: accountability, collaboration, and drive.')}
      ${p('If you need to reschedule, please reply to this email as soon as possible.')}
    `),
  });
}

// 6. Post-interview thank you
export async function emailPostInterviewThankYou(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'post_interview_thank_you',
    subject: `Thank you for interviewing with us — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Thank you for your time')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Thank you for taking the time to interview for <strong>${data.jobTitle ?? 'the position'}</strong> at Lightspeed Systems. It was great getting to know you better.`)}
      ${p('Our team will carefully review all candidates and be in touch within the next few business days with next steps.')}
      ${p('We appreciate your patience and your interest in joining our team.')}
    `),
  });
}

// 7. Offer extended
export async function emailOfferLetter(data: { to: string; firstName: string; jobTitle?: string; letterHtml: string }) {
  await sendEmail({
    to: data.to,
    templateId: 'offer_letter',
    subject: `Your offer from Lightspeed Systems${data.jobTitle ? ` \u2014 ${data.jobTitle}` : ''}`,
    html: data.letterHtml,
  });
}

export async function emailOfferExtended(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'offer_extended',
    subject: `We'd like to offer you the position — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('We\'d like to extend you an offer!')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`On behalf of the entire Lightspeed Systems team, we are thrilled to offer you the position of <strong>${data.jobTitle ?? 'the role'}</strong>.`)}
      ${data.offerDetails ? `<div style="background: #f0fdf4; border-left: 3px solid #22c55e; padding: 16px 20px; margin: 0 0 20px; font-size: 14px; line-height: 1.6;">${data.offerDetails}</div>` : ''}
      ${p('Your formal offer letter with all details will follow shortly. Please review it carefully and let us know if you have any questions.')}
      ${p('We\'re excited about the possibility of you joining the team and look forward to hearing from you!')}
    `),
  });
}

// 8. Welcome — hired
export async function emailWelcomeHired(data: CandidateEmailData) {
  await sendEmail({
    to: data.email,
    templateId: 'welcome_hired',
    subject: `Welcome to Lightspeed Systems, ${data.firstName}!`,
    html: wrap(`
      ${h1(`Welcome to the team, ${data.firstName}!`)}
      ${p(`We are so excited to officially welcome you to Lightspeed Systems as our new <strong>${data.jobTitle ?? 'team member'}</strong>.`)}
      ${p('Our onboarding team will be reaching out shortly with everything you need to know before your first day — including paperwork, equipment, and your first-week schedule.')}
      ${p('In the meantime, feel free to connect with us on <a href="https://linkedin.com/company/lightspeed-systems">LinkedIn</a> and follow our updates.')}
      ${p('We can\'t wait for you to start. Welcome aboard!')}
    `),
  });
}

// 9. Rejection (stage-aware)
export async function emailRejection(data: CandidateEmailData) {
  const stageMessages: Record<string, string> = {
    Applied: 'After carefully reviewing your application',
    Assessment: 'After reviewing your assessment results',
    'Work Sample': 'After evaluating your work sample',
    'Values Review': 'After our values review process',
    'Interview Scheduled': 'After further consideration',
    Interviewed: 'After your interview with our team',
    Offered: 'After reviewing our offer',
  };
  const opener = stageMessages[data.fromStage ?? 'Applied'] ?? 'After careful consideration';

  await sendEmail({
    to: data.email,
    templateId: 'rejection',
    subject: `Your application with Lightspeed Systems — ${data.jobTitle ?? 'Update'}`,
    html: wrap(`
      ${h1('An update on your application')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Thank you for your interest in the <strong>${data.jobTitle ?? 'position'}</strong> at Lightspeed Systems and for the time you invested in our process.`)}
      ${p(`${opener}, we have decided to move forward with other candidates at this time. This was a difficult decision — we had a highly competitive pool of applicants.`)}
      ${p('We genuinely appreciate the effort you put in and encourage you to apply for future openings that may be a fit. We\'ll keep your information on file.')}
      ${p('We wish you the very best in your search.')}
    `),
  });
}

// ── INTERNAL / HR-FACING (8 emails) ───────────────────────

// 10. New application received → HR
export async function emailNewApplicationHR(data: CandidateEmailData) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'new_application_hr',
    subject: `New application: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('New application received')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> has applied for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${p(`Email: ${data.email}`)}
      ${p('Log in to the hiring pipeline to review their application and advance or reject them.')}
    `),
  });
}

// 11. Assessment passed → HR
export async function emailAssessmentPassedHR(data: CandidateEmailData & { ccatScore?: number }) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'assessment_passed_hr',
    subject: `Assessment passed: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('Candidate passed the assessment')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> passed the CCAT/EPP assessment for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${(data as any).ccatScore != null ? p(`CCAT Score: <strong>${(data as any).ccatScore}</strong>`) : ''}
      ${p('They have been automatically advanced to the Work Sample stage and notified.')}
    `),
  });
}

// 12. Assessment failed → HR
export async function emailAssessmentFailedHR(data: CandidateEmailData & { ccatScore?: number; threshold?: number }) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'assessment_failed_hr',
    subject: `Assessment below threshold: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('Candidate did not meet assessment threshold')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> did not meet the CCAT threshold for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${(data as any).ccatScore != null ? p(`Score: <strong>${(data as any).ccatScore}</strong> (threshold: ${(data as any).threshold ?? 30})`) : ''}
      ${p('They have been moved to Rejected and notified. You can override this in the pipeline if needed.')}
    `),
  });
}

// 13. Work sample submitted → HR
export async function emailWorkSampleSubmittedHR(data: CandidateEmailData) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'work_sample_submitted_hr',
    subject: `Work sample ready for review: ${data.firstName} ${data.lastName}`,
    html: wrap(`
      ${h1('Work sample submitted')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> has submitted their work sample for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${p('Log in to the hiring pipeline to review their submission and advance or reject them.')}
    `),
  });
}

// 14. Interview scheduled → interviewer
export async function emailInterviewScheduledHR(data: CandidateEmailData) {
  const recipient = data.interviewerEmail || HR_EMAIL;
  await sendEmail({
    to: recipient,
    templateId: 'interview_scheduled_hr',
    subject: `Interview scheduled: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('Interview scheduled')}
      ${p(`An interview has been scheduled with <strong>${data.firstName} ${data.lastName}</strong> for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${data.interviewDate ? p(`Date: <strong>${data.interviewDate}</strong>`) : ''}
      ${p('The candidate has been notified. A Zoom meeting should be set up and shared with the candidate.')}
    `),
  });
}

// 15. Interview completed → HR
export async function emailInterviewCompletedHR(data: CandidateEmailData) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'interview_completed_hr',
    subject: `Interview complete: ${data.firstName} ${data.lastName} — awaiting feedback`,
    html: wrap(`
      ${h1('Interview completed')}
      ${p(`The interview with <strong>${data.firstName} ${data.lastName}</strong> for <strong>${data.jobTitle ?? 'the position'}</strong> has been completed.`)}
      ${p('The Zoom recording and transcript will be processed automatically. AI-generated feedback will be available in the pipeline shortly.')}
      ${p('Log in to review the feedback and advance or reject the candidate.')}
    `),
  });
}

// 16. Offer accepted → HR
export async function emailOfferAcceptedHR(data: CandidateEmailData) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'offer_accepted_hr',
    subject: `Offer accepted: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('Offer accepted!')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> has accepted the offer for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${p('Please initiate the onboarding process and update the candidate\'s status to Hired in the pipeline.')}
    `),
  });
}

// 17. Candidate hired → HR/onboarding
export async function emailCandidateHiredHR(data: CandidateEmailData) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'candidate_hired_hr',
    subject: `New hire confirmed: ${data.firstName} ${data.lastName} — ${data.jobTitle ?? 'position'}`,
    html: wrap(`
      ${h1('New hire confirmed')}
      ${p(`<strong>${data.firstName} ${data.lastName}</strong> has been marked as hired for <strong>${data.jobTitle ?? 'the position'}</strong>.`)}
      ${p('Please kick off onboarding: equipment provisioning, system access, first-day schedule, and new hire paperwork.')}
    `),
  });
}

// 18. Interview questions → interviewer
export async function emailInterviewerQuestions(data: {
  interviewerEmail: string;
  interviewerName: string;
  candidateFirstName: string;
  candidateLastName: string;
  jobTitle: string;
  questions: Array<{ category: string; question: string; rationale: string }>;
}) {
  const questionRows = data.questions.map((q, i) => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #555; white-space: nowrap;">${q.category}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px;">
        <strong>${i + 1}. ${q.question}</strong>
        ${q.rationale ? `<br/><span style="font-size: 12px; color: #888;">${q.rationale}</span>` : ''}
      </td>
    </tr>
  `).join('');

  await sendEmail({
    to: data.interviewerEmail,
    templateId: 'interviewer_questions',
    subject: `Interview prep: ${data.candidateFirstName} ${data.candidateLastName} — ${data.jobTitle}`,
    html: wrap(`
      ${h1('AI-Generated Interview Questions')}
      ${p(`Hi ${data.interviewerName},`)}
      ${p(`Here are tailored interview questions for <strong>${data.candidateFirstName} ${data.candidateLastName}</strong> applying for <strong>${data.jobTitle}</strong>. These were generated based on their CCAT results, EPP profile, resume review, and reference checks.`)}
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0 24px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888; width: 130px;">Category</th>
            <th style="padding: 8px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #888;">Question</th>
          </tr>
        </thead>
        <tbody>${questionRows}</tbody>
      </table>
      ${p('You don\'t need to ask every question — use these as a guide. Focus on areas where the candidate showed lower scores or where the notes flagged something to probe.')}
      ${p('Questions or concerns? Reply to this email or reach out to the hiring team.')}
    `),
  });
}

// ── Post-interview debrief emails (transcript → feedback) ──

// Interviewer-facing coaching summary (how THEY ran the interview).
export async function emailInterviewFeedbackInterviewer(data: {
  to: string;
  interviewerName?: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  feedbackInterviewer: string;
  appUrl?: string;
}) {
  await sendEmail({
    to: data.to,
    templateId: 'interview_feedback_interviewer',
    subject: `Your interview debrief: ${data.firstName} ${data.lastName}`,
    html: wrap(`
      ${h1('Interview Coaching Summary')}
      ${p(`Hi ${data.interviewerName ?? 'there'},`)}
      ${p(`Here's your debrief from the interview with <strong>${data.firstName} ${data.lastName}</strong>${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''}. It's auto-generated from the interview transcript \u2014 a quick read on what went well and where to push next time.`)}
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.6;margin:0;">${esc(data.feedbackInterviewer)}</pre>
      ${data.appUrl ? p(`Full candidate detail: <a href="${data.appUrl}">${data.appUrl}</a>`) : ''}
    `),
  });
}

// ── Interview scheduling emails ────────────────────────────

// Sent to an interviewer: "please share your availability" (tokenized link).
export async function emailAvailabilityRequest(data: {
  interviewerEmail: string;
  interviewerName?: string;
  candidateName: string;
  jobTitle?: string;
  availabilityUrl: string;
}) {
  await sendEmail({
    to: data.interviewerEmail,
    templateId: 'availability_request',
    subject: `Share your interview availability — ${data.candidateName}${data.jobTitle ? ` (${data.jobTitle})` : ''}`,
    html: wrap(`
      ${h1('Share your interview availability')}
      ${p(`Hi ${data.interviewerName ?? 'there'},`)}
      ${p(`It's time to interview <strong>${data.candidateName}</strong>${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''}. Please add a few open time blocks and the candidate will pick one that works for them.`)}
      ${button('Add your availability', data.availabilityUrl)}
      ${p(`<span style="font-size:12px;color:#888;">If the button doesn't work, paste this link: ${data.availabilityUrl}</span>`)}
    `),
  });
}

// Sent to a candidate: "pick your interview time" (tokenized link).
export async function emailBookingInvite(data: {
  email: string;
  firstName: string;
  jobTitle?: string;
  bookingUrl: string;
}) {
  await sendEmail({
    to: data.email,
    templateId: 'booking_invite',
    subject: `Book your interview — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Book your interview')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Good news — you're advancing to the interview stage${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''}. Please pick the time that works best for you from the available slots.`)}
      ${button('Choose your interview time', data.bookingUrl)}
      ${p(`<span style="font-size:12px;color:#888;">If the button doesn't work, paste this link: ${data.bookingUrl}</span>`)}
    `),
  });
}

// Sent to a candidate once they book — includes a calendar invite.
export async function emailInterviewBookedCandidate(data: {
  email: string;
  firstName: string;
  jobTitle?: string;
  interviewDate: string;
  interviewerName?: string;
  joinUrl?: string;
  icsBase64?: string;
}) {
  await sendEmail({
    to: data.email,
    templateId: 'interview_booked',
    subject: `Your interview is confirmed — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Your interview is confirmed')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`Your interview${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''} is booked.`)}
      ${p(`<strong>When:</strong> ${data.interviewDate}`)}
      ${data.interviewerName ? p(`<strong>Interviewer:</strong> ${data.interviewerName}`) : ''}
      ${data.joinUrl ? p(`<strong>Join link:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a>`) : p('You\'ll receive the Zoom join link shortly.')}
      ${p('A calendar invite is attached. If you need to reschedule, reply to this email as soon as possible.')}
    `),
    attachments: data.icsBase64
      ? [{ content: data.icsBase64, filename: 'interview.ics', type: 'text/calendar' }]
      : undefined,
  });
}

// Sent to the interviewer once the candidate books — includes a calendar invite.
export async function emailInterviewerBooked(data: {
  interviewerEmail: string;
  interviewerName?: string;
  candidateName: string;
  jobTitle?: string;
  interviewDate: string;
  joinUrl?: string;
  icsBase64?: string;
}) {
  await sendEmail({
    to: data.interviewerEmail,
    templateId: 'interviewer_booked',
    subject: `Interview booked: ${data.candidateName}${data.jobTitle ? ` — ${data.jobTitle}` : ''}`,
    html: wrap(`
      ${h1('Interview booked')}
      ${p(`Hi ${data.interviewerName ?? 'there'},`)}
      ${p(`<strong>${data.candidateName}</strong> booked an interview slot${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''}.`)}
      ${p(`<strong>When:</strong> ${data.interviewDate}`)}
      ${data.joinUrl ? p(`<strong>Join link:</strong> <a href="${data.joinUrl}">${data.joinUrl}</a>`) : ''}
      ${p('A calendar invite is attached.')}
    `),
    attachments: data.icsBase64
      ? [{ content: data.icsBase64, filename: 'interview.ics', type: 'text/calendar' }]
      : undefined,
  });
}

// Sent to a candidate who hasn't booked within the window.
export async function emailBookingReminderCandidate(data: {
  email: string;
  firstName: string;
  jobTitle?: string;
  bookingUrl: string;
}) {
  await sendEmail({
    to: data.email,
    templateId: 'interview_booking_reminder',
    subject: `Reminder: book your interview — ${data.jobTitle ?? 'Lightspeed Systems'}`,
    html: wrap(`
      ${h1('Don\'t forget to book your interview')}
      ${p(`Hi ${data.firstName},`)}
      ${p(`This is a friendly reminder to choose your interview time${data.jobTitle ? ` for <strong>${data.jobTitle}</strong>` : ''}. Slots are limited, so please book as soon as you can.`)}
      ${button('Choose your interview time', data.bookingUrl)}
      ${p(`<span style="font-size:12px;color:#888;">If the button doesn't work, paste this link: ${data.bookingUrl}</span>`)}
    `),
  });
}

// Sent to HR when a candidate hasn't booked past the target window.
export async function emailBookingStalledHR(data: {
  candidateName: string;
  jobTitle?: string;
  daysOpen: number;
}) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'interview_booking_stalled_hr',
    subject: `Interview not booked: ${data.candidateName}${data.jobTitle ? ` — ${data.jobTitle}` : ''}`,
    html: wrap(`
      ${h1('Candidate hasn\'t booked an interview')}
      ${p(`<strong>${data.candidateName}</strong>${data.jobTitle ? ` (${data.jobTitle})` : ''} was invited to book an interview ${data.daysOpen} day(s) ago and still hasn't picked a slot — past the target window.`)}
      ${p('You may want to follow up directly or check that interviewer availability was provided.')}
    `),
  });
}

// HR flag when a candidate self-books outside the target interview window or
// spreads their rounds beyond 48 hours. The booking already happened in the
// scheduling tool, so we can't block it — we surface it so HR can rebook.
export async function emailBookingOutsideWindowHR(data: {
  candidateName: string;
  jobTitle?: string;
  reason: string;
}) {
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'interview_booking_outside_window_hr',
    subject: `Interview booked outside the window: ${data.candidateName}${data.jobTitle ? ` — ${data.jobTitle}` : ''}`,
    html: wrap(`
      ${h1('Interview booked outside the target window')}
      ${p(`<strong>${data.candidateName}</strong>${data.jobTitle ? ` (${data.jobTitle})` : ''} self-booked an interview that falls outside the planned window.`)}
      ${p(data.reason)}
      ${p('Consider rebooking so all rounds stay inside the ~48-hour window.')}
    `),
  });
}

// ── Stage-transition dispatcher ────────────────────────────
// Called by the candidates router on every stage change.

export async function dispatchStageEmail(
  toStage: string,
  fromStage: string | null | undefined,
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
    jobTitle?: string;
    workSampleInstructions?: string;
    workSampleUrl?: string;
    interviewerName?: string | null;
    interviewerEmail?: string | null;
  }
): Promise<void> {
  const data: CandidateEmailData = {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    jobTitle: candidate.jobTitle,
    fromStage: fromStage ?? undefined,
    workSampleInstructions: candidate.workSampleInstructions,
    workSampleUrl: candidate.workSampleUrl,
    interviewerName: candidate.interviewerName ?? undefined,
    interviewerEmail: candidate.interviewerEmail ?? undefined,
  };

  // Candidate-facing
  switch (toStage) {
    case 'Assessment':
      await emailInvitedToAssessment(data);
      break;
    case 'Work Sample':
      await emailInvitedToWorkSample(data);
      await emailAssessmentPassedHR(data);
      break;
    case 'Values Review':
      await emailAdvancingToValuesReview(data);
      await emailWorkSampleSubmittedHR(data);
      break;
    case 'Interview Scheduled':
      await emailInterviewScheduled(data);
      await emailInterviewScheduledHR(data);
      break;
    case 'Interviewed':
      await emailPostInterviewThankYou(data);
      await emailInterviewCompletedHR(data);
      break;
    case 'Offered':
      await emailOfferExtended(data);
      await emailOfferAcceptedHR(data);
      break;
    case 'Hired':
      await emailWelcomeHired(data);
      await emailCandidateHiredHR(data);
      break;
    case 'Rejected':
      await emailRejection(data);
      break;
  }
}


// ============================================================
// INTAKE APPROVAL NOTIFICATIONS
// Fake per-department inboxes for testing (override via env).
// ============================================================

export const APPROVER_LABELS: Record<string, string> = {
  hiring_manager: 'Hiring Manager', elt: 'ELT Leader', finance: 'Finance', hr: 'HR',
};

export function approverEmail(label: string): string {
  const key = (label ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    'hiring manager': process.env.HIRING_MANAGER_INBOX ?? 'hiring-manager@lightspeed.test',
    'elt leader': process.env.ELT_INBOX ?? 'elt@lightspeed.test',
    'elt': process.env.ELT_INBOX ?? 'elt@lightspeed.test',
    'finance': process.env.FINANCE_INBOX ?? 'finance@lightspeed.test',
    'hr': process.env.HR_INBOX ?? 'hr@lightspeed.test',
    'human resources': process.env.HR_INBOX ?? 'hr@lightspeed.test',
  };
  if (map[key]) return map[key];
  const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'approver';
  return `${slug}@lightspeed.test`;
}

export const APPROVER_EMAILS: Record<string, string> = {
  hiring_manager: process.env.HIRING_MANAGER_INBOX ?? 'hiring-manager@lightspeed.test',
  elt: process.env.ELT_INBOX ?? 'elt@lightspeed.test',
  finance: process.env.FINANCE_INBOX ?? 'finance@lightspeed.test',
  hr: process.env.HR_INBOX ?? 'hr@lightspeed.test',
};

interface ApprovalRequestData {
  roleLabel: string;
  department: string;
  hiringManager: string;
  jobTitle?: string;
  approvalUrl?: string;
  summaryRows?: Array<{ label: string; value: string }>;
}

export function buildApprovalRequestEmail(d: ApprovalRequestData): { subject: string; html: string; text: string } {
  const role = `${d.department}${d.jobTitle ? ' \u00b7 ' + d.jobTitle : ''}`;
  const subject = `Approval needed (${d.roleLabel}): ${role} intake`;
  const summary = (d.summaryRows ?? []).map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;white-space:nowrap;">${r.label}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:14px;">${r.value}</td>
    </tr>`).join('');
  const html = wrap(`
    ${h1('An intake needs your approval')}
    ${p(`A new hiring intake for <strong>${role}</strong> has been submitted by <strong>${d.hiringManager}</strong> and needs your <strong>${d.roleLabel}</strong> approval.`)}
    ${summary ? `<table style="width:100%;border-collapse:collapse;margin:8px 0 20px;background:#fafbfc;border:1px solid #eee;border-radius:8px;">${summary}</table>` : ''}
    ${d.approvalUrl ? button('Review & approve this intake', d.approvalUrl) : p('Open the Talent Assessment app \u2192 Intake to review and approve.')}
    ${d.approvalUrl ? p('<span style="font-size:12px;color:#888;">This opens a secure page with the full intake where you can approve or reject in one click \u2014 no login required.</span>') : ''}
  `);
  const text = `A new hiring intake for ${role}, submitted by ${d.hiringManager}, needs your ${d.roleLabel} approval.${d.approvalUrl ? ' Review & approve: ' + d.approvalUrl : ' Open the app \u2192 Intake to approve.'}`;
  return { subject, html, text };
}

export async function sendApprovalRequest(to: string, d: ApprovalRequestData): Promise<void> {
  const { subject, html } = buildApprovalRequestEmail(d);
  await sendEmail({ to, subject, html, templateId: `intake_approval_${d.roleLabel.replace(/\s+/g, '_').toLowerCase()}` });
}


// ============================================================
// INTAKE KICKOFF (fires on final approval)
// ============================================================

export const HIRING_TEAM_INBOX = process.env.HIRING_TEAM_INBOX ?? 'hiring-team@lightspeed.test';

interface KickoffData {
  department: string;
  jobTitle?: string;
  hiringManager: string;
  summaryRows: Array<{ label: string; value: string }>;
  team: Array<{ personRef: string; roleInProcess?: string | null; roundRef?: string | null }>;
  awareness: Array<{ personRef: string }>;
  rounds: Array<{ roundName: string; lengthMin?: number | null; format?: string | null }>;
  jdTitle?: string;
  questions?: Array<{ category?: string; question: string }>;
  externalPostDate?: string;
}

export function buildKickoffEmail(d: KickoffData): { subject: string; html: string; text: string } {
  const role = `${d.department}${d.jobTitle ? ' \u00b7 ' + d.jobTitle : ''}`;
  const subject = `Hiring kickoff: ${role} — approved & open`;
  const summary = d.summaryRows.map((r) => `
    <tr><td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#666;white-space:nowrap;">${r.label}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:14px;">${r.value}</td></tr>`).join('');
  const roundsList = d.rounds.length
    ? '<ul style="margin:6px 0 16px;padding-left:18px;font-size:14px;color:#333;">' +
      d.rounds.map((r) => `<li>${r.roundName}${r.lengthMin ? ' · ' + r.lengthMin + ' min' : ''}${r.format ? ' · ' + r.format : ''}</li>`).join('') + '</ul>'
    : p('<em>No interview rounds specified.</em>');
  const teamList = d.team.length
    ? '<ul style="margin:6px 0 16px;padding-left:18px;font-size:14px;color:#333;">' +
      d.team.map((t) => `<li>${t.personRef}${t.roleInProcess ? ' — ' + t.roleInProcess : ''}${t.roundRef ? ' (' + t.roundRef + ')' : ''}</li>`).join('') + '</ul>'
    : p('<em>No interview team set.</em>');
  const awarenessList = d.awareness.length
    ? p('Also kept informed: ' + d.awareness.map((a) => a.personRef).join(', '))
    : '';
  const html = wrap(`
    ${h1('Hiring kickoff')}
    ${p(`The intake for <strong>${role}</strong> (submitted by ${d.hiringManager}) has been <strong>fully approved</strong>. Here's everything the team needs to run this search.`)}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;background:#fafbfc;border:1px solid #eee;border-radius:8px;">${summary}</table>
    <p style="font-size:13px;font-weight:700;color:#33465c;margin:0 0 2px;">Interview plan</p>${roundsList}
    <p style="font-size:13px;font-weight:700;color:#33465c;margin:0 0 2px;">Hiring team</p>${teamList}
    ${awarenessList}
    <p style="font-size:13px;font-weight:700;color:#33465c;margin:14px 0 2px;">Automatically prepared</p>
    <ul style="margin:6px 0 16px;padding-left:18px;font-size:14px;color:#333;">
      <li>${d.jdTitle ? `Draft job description created (<strong>${d.jdTitle}</strong>) — review &amp; publish in the Job Descriptions library.` : 'Job description: pending.'}</li>
      <li>${d.questions && d.questions.length ? `${d.questions.length} interview questions prepared (see below).` : 'Interview questions: pending.'}</li>
      <li>${d.externalPostDate ? `Role posted <strong>internally now</strong> (3-day window); opens <strong>externally on ${d.externalPostDate}</strong>.` : 'Posting: pending.'}</li>
    </ul>
    ${d.questions && d.questions.length ? `<p style="font-size:13px;font-weight:700;color:#33465c;margin:0 0 2px;">Interview questions</p><ol style="margin:6px 0 16px;padding-left:20px;font-size:13px;color:#333;">${d.questions.map((q) => `<li>${q.question}${q.category ? ` <span style=\"color:#999;\">(${q.category})</span>` : ''}</li>`).join('')}</ol>` : ''}
    ${p('<span style="font-size:12px;color:#888;">Candidate self-scheduling link will appear here once the scheduling tool is connected.</span>')}
  `);
  const text = `Hiring kickoff — ${role} has been fully approved and is open. Hiring manager: ${d.hiringManager}. Team: ${d.team.map((t) => t.personRef).join(', ') || 'none set'}. Rounds: ${d.rounds.map((r) => r.roundName).join(', ') || 'none'}. Scheduling link pending the scheduling-tool integration.`;
  return { subject, html, text };
}

// ============================================================
// EXPANDED-SCOPE AUTOMATED EMAILS (2026-07-07)
//   - approval rejected -> submitter
//   - stalled approval reminder -> approver (+ HR escalation)
//   - requisition closed / on hold -> active candidates
//   - day-before interview reminder -> candidate + interviewer
// ============================================================

export async function emailApprovalRejected(to: string, d: {
  roleLabel: string; department: string; jobTitle?: string; hiringManager: string; note: string;
}): Promise<void> {
  const role = `${d.department}${d.jobTitle ? ' · ' + d.jobTitle : ''}`;
  const subject = `Intake rejected (${d.roleLabel}): ${role}`;
  const html = wrap(`
    ${h1('An intake was rejected in approval')}
    ${p(`The hiring intake for <strong>${role}</strong> (hiring manager ${d.hiringManager}) was <strong>rejected</strong> at the <strong>${d.roleLabel}</strong> approval step and has been sent back to Draft.`)}
    ${p(`<strong>Reason given:</strong><br/>${d.note}`)}
    ${p('Update the intake to address the feedback, then re-submit it to restart the approval chain.')}
  `);
  await sendEmail({ to, subject, html, templateId: 'intake_rejected' });
}

export async function emailApprovalSentBack(to: string, d: {
  roleLabel: string; department: string; jobTitle?: string; hiringManager: string; note: string; editUrl?: string;
}): Promise<void> {
  const role = `${d.department}${d.jobTitle ? ' - ' + d.jobTitle : ''}`;
  const subject = `Intake sent back for edits (${d.roleLabel}): ${role}`;
  const html = wrap(`
    ${h1('An intake was sent back for edits')}
    ${p(`The hiring intake for <strong>${role}</strong> (hiring manager ${d.hiringManager}) was <strong>sent back for edits</strong> at the <strong>${d.roleLabel}</strong> approval step. <strong>This is not a rejection</strong>; it just needs some changes before it can move forward.`)}
    ${p(`<strong>What to change:</strong><br/>${d.note}`)}
    ${d.editUrl ? button('Open, review & edit the intake', d.editUrl) : p('Open the Talent Assessment app \u2192 Intake to make the changes.')}
    ${d.editUrl ? p('<span style="font-size:12px;color:#888;">Opens the intake so you can edit it in place and re-submit \u2014 no need to find the original form.</span>') : ''}
  `);
  await sendEmail({ to, subject, html, templateId: 'intake_sent_back' });
}

export async function emailApprovalReminder(to: string, d: {
  roleLabel: string; department: string; jobTitle?: string; hiringManager: string; daysPending: number; approvalUrl?: string;
}): Promise<void> {
  const role = `${d.department}${d.jobTitle ? ' · ' + d.jobTitle : ''}`;
  const subject = `Reminder: your ${d.roleLabel} approval is pending — ${role}`;
  const html = wrap(`
    ${h1('An approval is waiting on you')}
    ${p(`The hiring intake for <strong>${role}</strong> (hiring manager ${d.hiringManager}) has been waiting <strong>${d.daysPending} day(s)</strong> for your <strong>${d.roleLabel}</strong> approval.`)}
    ${d.approvalUrl ? button('Review & approve now', d.approvalUrl) : p('Open the Talent Assessment app → Intake to review and approve.')}
  `);
  await sendEmail({ to, subject, html, templateId: 'intake_approval_reminder' });
}

export async function emailReqStatusToCandidate(data: CandidateEmailData & { onHold?: boolean }): Promise<void> {
  const onHold = !!data.onHold;
  const subject = onHold
    ? `Update on the ${data.jobTitle ?? 'role'} at Lightspeed Systems`
    : `Update on your application — ${data.jobTitle ?? 'Lightspeed Systems'}`;
  const body = onHold
    ? p(`We wanted to let you know that the <strong>${data.jobTitle ?? 'role'}</strong> you're being considered for at Lightspeed Systems has been temporarily placed <strong>on hold</strong>. Your application remains active, and we'll be back in touch as soon as the process resumes. Thank you for your patience.`)
    : p(`Thank you for your interest in the <strong>${data.jobTitle ?? 'role'}</strong> at Lightspeed Systems. This position has been <strong>closed</strong>, so we won't be moving forward with hiring for it at this time. We're grateful for the time you invested and encourage you to apply for future openings.`);
  const html = wrap(`${h1(onHold ? 'Your application is on hold' : 'Update on the role')}${p(`Hi ${data.firstName},`)}${body}${p('Best,<br/>Lightspeed Systems Recruiting')}`);
  await sendEmail({ to: data.email, subject, html, templateId: onHold ? 'req_on_hold' : 'req_closed' });
}

export async function emailInterviewReminderCandidate(data: CandidateEmailData & { whenText?: string }): Promise<void> {
  const subject = `Reminder: your interview tomorrow — ${data.jobTitle ?? 'Lightspeed Systems'}`;
  const html = wrap(`
    ${h1('Your interview is tomorrow')}
    ${p(`Hi ${data.firstName},`)}
    ${p(`This is a friendly reminder about your upcoming interview for the <strong>${data.jobTitle ?? 'role'}</strong> at Lightspeed Systems${data.whenText ? `, scheduled for <strong>${data.whenText}</strong>` : ' tomorrow'}.`)}
    ${data.interviewerName ? p(`You'll be meeting with <strong>${data.interviewerName}</strong>.`) : ''}
    ${p('If anything has changed or you need to reschedule, just reply to this email. Good luck!')}
    ${p('Best,<br/>Lightspeed Systems Recruiting')}
  `);
  await sendEmail({ to: data.email, subject, html, templateId: 'interview_reminder_candidate' });
}

export async function emailInterviewReminderInterviewer(data: {
  interviewerEmail: string; interviewerName?: string | null; candidateName: string; jobTitle?: string; whenText?: string;
}): Promise<void> {
  const subject = `Reminder: interview tomorrow with ${data.candidateName}${data.jobTitle ? ` — ${data.jobTitle}` : ''}`;
  const html = wrap(`
    ${h1('Interview reminder')}
    ${p(`Hi${data.interviewerName ? ' ' + data.interviewerName : ''},`)}
    ${p(`This is a reminder that you're interviewing <strong>${data.candidateName}</strong> for the <strong>${data.jobTitle ?? 'role'}</strong>${data.whenText ? ` <strong>${data.whenText}</strong>` : ' tomorrow'}.`)}
    ${p('The candidate-specific question set and prep are in the Talent Assessment app. Thanks!')}
  `);
  await sendEmail({ to: data.interviewerEmail, subject, html, templateId: 'interview_reminder_interviewer' });
}

export async function emailPostingOpenedExternal(to: string, d: { jobTitle: string; department?: string; mode: 'auto' | 'manual' }): Promise<void> {
  const role = `${d.jobTitle}${d.department ? ' · ' + d.department : ''}`;
  const subject = `Now open externally: ${role}`;
  const html = wrap(`
    ${h1('Role now open to external candidates')}
    ${p(`The internal-first window for <strong>${role}</strong> has ${d.mode === 'auto' ? 'closed' : 'been opened early by HR'}.`)}
    ${p('You can now proceed with external sourcing and posting for this role.')}
  `);
  await sendEmail({ to, subject, html, templateId: 'posting_external_open' });
}

// ── Interviewer report (auto post-assessment review) ───────
// One email to the interviewer: a summary of the candidate's screen results
// (CCAT, EPP match, company-values match, resume, work sample), their top EPP
// traits, and the 30% tailored interview questions.
export async function emailInterviewerReport(data: {
  interviewerEmail: string;
  interviewerName: string;
  candidateFirstName: string;
  candidateLastName: string;
  jobTitle: string;
  ccatScore?: number | null;
  eppMatch?: number | null;
  valuesMatch?: number | null;
  resumeReviewScore?: number | null;
  workSampleScore?: number | null;
  eppTraits?: Array<{ trait: string; percentile: number }>;
  valueScores?: Array<{ value: string; score: number }>;
  questions: Array<{ category?: string; question: string; rationale?: string }>;
}) {
  const cell = 'padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;';
  const scoreRows = [
    ['CCAT (cognitive)', data.ccatScore != null ? `${data.ccatScore} / 50` : '—'],
    ['EPP match', data.eppMatch != null ? `${data.eppMatch}%` : '—'],
    ['Company-values match', data.valuesMatch != null ? `${data.valuesMatch}%` : '—'],
    ['Resume review', data.resumeReviewScore != null ? `${data.resumeReviewScore}/100` : '—'],
    ['Work sample', data.workSampleScore != null ? `${data.workSampleScore}/100` : '—'],
  ].map(([k, v]) => `<tr><td style="${cell}color:#555;white-space:nowrap;">${k}</td><td style="${cell}font-weight:600;">${v}</td></tr>`).join('');

  const traits = (data.eppTraits ?? []).slice().sort((a, b) => b.percentile - a.percentile);
  const traitRows = traits.map((t) => `<tr><td style="${cell}color:#555;">${t.trait}</td><td style="${cell}">${t.percentile}</td></tr>`).join('');

  const questionRows = data.questions.map((q, i) => `
    <tr>
      <td style="${cell}color:#555;white-space:nowrap;vertical-align:top;">${q.category ?? ''}</td>
      <td style="${cell}">
        <strong>${i + 1}. ${q.question}</strong>
        ${q.rationale ? `<br/><span style="font-size:12px;color:#888;">${q.rationale}</span>` : ''}
      </td>
    </tr>`).join('');

  await sendEmail({
    to: data.interviewerEmail,
    templateId: 'interviewer_report',
    subject: `Interview brief: ${data.candidateFirstName} ${data.candidateLastName} — ${data.jobTitle}`,
    html: wrap(`
      ${h1('Candidate Interview Brief')}
      ${p(`Hi ${data.interviewerName},`)}
      ${p(`<strong>${data.candidateFirstName} ${data.candidateLastName}</strong> passed the automated screen for <strong>${data.jobTitle}</strong> (EPP match and company-values match both at or above 70%). Here's the summary and the tailored questions to guide your interview.`)}
      <h3 style="font-size:14px;margin:20px 0 6px;">Screen results</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${scoreRows}</table>
      <h3 style="font-size:14px;margin:20px 0 6px;">EPP profile (percentile vs norm, high to low)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${traitRows}</table>
      <h3 style="font-size:14px;margin:20px 0 6px;">Tailored interview questions (the 30%)</h3>
      <table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">
        <thead><tr style="background:#f5f5f5;"><th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#888;width:130px;">Category</th><th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#888;">Question</th></tr></thead>
        <tbody>${questionRows}</tbody>
      </table>
      ${p('Use these alongside the standard question set. Focus on areas flagged as gaps or clarifications.')}
    `),
  });
}

export async function emailInternalApplicantHR(data: { firstName: string; lastName: string; email: string; jobTitle?: string; currentRole?: string | null }) {
  const who = `${data.firstName} ${data.lastName}`;
  await sendEmail({
    to: HR_EMAIL,
    templateId: 'internal_applicant_hr',
    subject: `Internal applicant: ${who} — ${data.jobTitle ?? 'a role'}`,
    html: wrap(`
      ${h1('An internal employee expressed interest')}
      ${p(`<strong>${who}</strong>${data.currentRole ? ` (currently ${data.currentRole})` : ''} just expressed interest in <strong>${data.jobTitle ?? 'an open role'}</strong> through the internal posting.`)}
      ${p('They’ve been added to the Internal Pipeline. <strong>Loop in their leadership chain up to ELT now</strong> so no one is caught off guard, and confirm their current manager is aware. You can set their leadership chain and notify it from the candidate’s record.')}
    `),
  });
}

export async function emailInternalInterestAlert(to: string, d: { applicantName: string; currentRole?: string | null; jobTitle?: string; forManager?: boolean }) {
  const who = d.applicantName;
  await sendEmail({
    to,
    templateId: 'internal_interest_alert',
    subject: `Internal interest: ${who} — ${d.jobTitle ?? 'a role'}`,
    html: wrap(`
      ${h1('An internal employee just expressed interest')}
      ${p(`<strong>${who}</strong>${d.currentRole ? ` (currently ${d.currentRole})` : ''} expressed interest in <strong>${d.jobTitle ?? 'an open role'}</strong>.`)}
      ${p(d.forManager
        ? 'You are getting this as their manager so you know right away. Nothing is required here — this is just to keep you in the loop.'
        : 'You are on the leadership-awareness list for internal moves. This is sent the moment someone applies so no one is caught off guard.')}
    `),
  });
}

// ── Per-round interviewer prep (with cross-round briefing) ──
// Sent to the interviewer BEFORE a round. Includes the read on the
// candidate from earlier COMPLETED rounds (numeric scores hidden) and a
// consolidated "follow up in this round" list. Interviewer-coaching
// notes from earlier rounds are deliberately NOT included.
export async function emailInterviewRoundPrep(data: {
  to: string;
  interviewerName?: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  roundName: string;
  briefing: {
    rounds: { roundName: string; interviewerName: string | null; writtenRead: string }[];
    followUps: { roundName: string; type: 'avoided' | 'half_answered' | 'suggested'; text: string }[];
  };
}) {
  const label: Record<string, string> = {
    avoided: 'Avoided',
    half_answered: 'Half-answered',
    suggested: 'Suggested',
  };

  const contextBlock = data.briefing.rounds.length
    ? `<h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">Context from earlier rounds</h2>` +
      data.briefing.rounds.map((r) => `
        <div style="margin:0 0 14px;">
          <div style="font-size:14px;font-weight:600;">${esc(r.roundName)}${r.interviewerName ? ` <span style="font-weight:400;color:#888;">· ${esc(r.interviewerName)}</span>` : ''}</div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;margin:6px 0 0;color:#444;">${esc(r.writtenRead)}</pre>
        </div>`).join('')
    : p('This is the first interview round on file, so there is no earlier context to share yet.');

  const followBlock = data.briefing.followUps.length
    ? `<h2 style="font-size:16px;font-weight:600;margin:24px 0 8px;">Follow up in this round</h2>
       <ul style="font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:20px;">` +
       data.briefing.followUps.map((f) =>
         `<li><strong>${label[f.type] ?? 'Follow up'} (${esc(f.roundName)}):</strong> ${esc(f.text)}</li>`).join('') +
       `</ul>`
    : '';

  const guard = data.briefing.rounds.length
    ? p(`<span style="font-size:12px;color:#888;">Earlier scores are hidden so each round stays independent, and coaching notes written for the earlier interviewers aren't shared — this is the read on the candidate only.</span>`)
    : '';

  await sendEmail({
    to: data.to,
    templateId: 'interview_round_prep',
    subject: `Interview prep: ${data.firstName} ${data.lastName} — ${data.roundName}`,
    html: wrap(`
      ${h1(`Interview prep — ${esc(data.roundName)}`)}
      ${p(`Hi ${data.interviewerName ? esc(data.interviewerName) : 'there'},`)}
      ${p(`You're up for the <strong>${esc(data.roundName)}</strong> interview with <strong>${esc(data.firstName)} ${esc(data.lastName)}</strong>${data.jobTitle ? ` for <strong>${esc(data.jobTitle)}</strong>` : ''}. Here's what earlier rounds found and what to dig into.`)}
      ${contextBlock}
      ${followBlock}
      ${guard}
    `),
  });
}
