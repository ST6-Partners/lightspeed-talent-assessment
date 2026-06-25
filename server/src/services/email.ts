// ============================================================
// EMAIL SERVICE — 17 automated hiring pipeline emails
//
// SANDBOX MODE (default): emails are logged to console only.
// No emails are sent, no Resend account needed.
//
// TO GO LIVE: set RESEND_API_KEY in Railway environment variables.
// All 17 templates will fire automatically on stage changes.
// ============================================================

const SANDBOX = !process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'hiring@lightspeedsystems.com';
const HR_EMAIL = process.env.HR_EMAIL ?? 'jade.friedman@lsscorp.net';

// Lazy-load Resend so the app boots fine even without the package installed
let resend: any = null;
async function getResend() {
  if (SANDBOX) return null;
  if (!resend) {
    const { Resend } = await import('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// ── Core send function ─────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  templateId: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (SANDBOX) {
    console.log(`[EMAIL SANDBOX] Template: ${payload.templateId} | To: ${payload.to} | Subject: ${payload.subject}`);
    return;
  }
  try {
    const client = await getResend();
    await client.emails.send({
      from: FROM_ADDRESS,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
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
  interviewDate?: string;
  interviewerName?: string;
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
  const recipient = data.interviewerName
    ? HR_EMAIL // Will expand to interviewer email when that field is added
    : HR_EMAIL;
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
    interviewerName?: string | null;
  }
): Promise<void> {
  const data: CandidateEmailData = {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    jobTitle: candidate.jobTitle,
    fromStage: fromStage ?? undefined,
    workSampleInstructions: candidate.workSampleInstructions,
    interviewerName: candidate.interviewerName ?? undefined,
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
