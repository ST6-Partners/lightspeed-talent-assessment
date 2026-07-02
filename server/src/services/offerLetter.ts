// ============================================================
// OFFER LETTER (EXTERNAL) — deterministic template renderer.
//
// Per the hiring team: the editable fields (title, pay, start date,
// etc.) appear in the SAME place every time and are the only things
// that need review; everything else is fixed stock language that
// never changes; anything unique/custom goes on an ADDENDUM. Rendered
// deterministically (NOT AI) so the legal language can't be
// hallucinated or drift. Internal offers are intentionally out of
// scope for now (trickier — can lag).
//
// NOTE: the stock language below is a template placeholder and should
// be reviewed by counsel before real use.
// ============================================================

export interface OfferAddendumItem {
  title: string;
  body: string;
}

export interface OfferLetterInput {
  firstName: string;
  lastName: string;
  jobTitle: string;
  department?: string | null;
  reportsTo?: string | null;
  employmentType?: string | null;   // e.g. Full-Time
  baseSalary?: number | null;        // annual, USD
  startDate?: string | null;         // free text, e.g. "August 4, 2025"
  location?: string | null;
  addendum?: OfferAddendumItem[];
}

function money(n?: number | null): string {
  if (n == null) return '[base salary]';
  return '$' + n.toLocaleString('en-US');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One row of the fixed "Offer Details" block — always the same order/place.
function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 16px 6px 0;color:#555;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111;">${value}</td>
  </tr>`;
}

export function renderOfferLetter(input: OfferLetterInput): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = `${input.firstName} ${input.lastName}`.trim();

  const details = [
    row('Position', esc(input.jobTitle || '[title]')),
    input.department ? row('Department', esc(input.department)) : '',
    input.reportsTo ? row('Reports to', esc(input.reportsTo)) : '',
    row('Employment type', esc(input.employmentType || 'Full-Time')),
    row('Base salary', money(input.baseSalary) + ' per year'),
    row('Start date', esc(input.startDate || '[start date]')),
    input.location ? row('Location', esc(input.location)) : '',
  ].filter(Boolean).join('');

  const addendumHtml = (input.addendum && input.addendum.length)
    ? input.addendum.map((a, i) => `
      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#888;margin-bottom:6px;">Addendum ${String.fromCharCode(65 + i)}</div>
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px;">${esc(a.title)}</div>
        <div style="font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${esc(a.body)}</div>
      </div>`).join('')
    : '';

  // Fixed stock language — does not change per candidate.
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;color:#1a1a1a;padding:32px 28px;">
    <div style="font-family:sans-serif;font-weight:800;font-size:18px;color:#111;">Lightspeed Systems</div>
    <div style="color:#888;font-size:13px;margin-bottom:24px;">${today}</div>

    <p style="font-size:15px;line-height:1.6;">Dear ${esc(input.firstName)},</p>

    <p style="font-size:15px;line-height:1.6;">On behalf of Lightspeed Systems, I am pleased to offer you the position of
    <strong>${esc(input.jobTitle || 'the role')}</strong>. We were impressed throughout the process and are excited about
    the contributions you will make to our team. The specific terms of your offer are below.</p>

    <table style="border-collapse:collapse;margin:8px 0 20px;">${details}</table>

    <p style="font-size:14px;line-height:1.6;">This offer of employment is contingent upon your ability to provide
    documentation establishing your identity and authorization to work, and upon the successful completion of any
    pre-employment checks required for the role.</p>

    <p style="font-size:14px;line-height:1.6;">Your employment with Lightspeed Systems is <strong>at will</strong>, meaning
    that either you or the company may end the employment relationship at any time, with or without cause or notice. This
    letter is not a contract of employment for any specific duration.</p>

    <p style="font-size:14px;line-height:1.6;">You will be eligible to participate in the company's standard benefit
    programs in accordance with the applicable plan terms, which may be amended from time to time.</p>

    <p style="font-size:14px;line-height:1.6;">To accept this offer, please sign and return this letter. This offer will
    remain open for five (5) business days from the date above.</p>

    <p style="font-size:15px;line-height:1.6;margin-top:20px;">We look forward to welcoming you to the team.</p>

    <div style="margin-top:28px;font-size:14px;line-height:1.9;">
      Sincerely,<br/>
      <strong>Lightspeed Systems</strong><br/>
      Talent Acquisition
    </div>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:14px;line-height:2.2;">
      Accepted by: ______________________________<br/>
      ${esc(name)}<br/>
      Date: ______________________________
    </div>

    ${addendumHtml}
  </div>`;
}
