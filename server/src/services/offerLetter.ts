// ============================================================
// OFFER LETTER (EXTERNAL) — deterministic template renderer.
//
// Per the hiring team: the editable fields (title, pay, start date,
// etc.) appear in the SAME place every time and are the only things
// that need review; everything else is fixed stock language;
// anything unique/custom goes on an ADDENDUM. Rendered
// deterministically (NOT AI) so the legal language can't be
// hallucinated or drift. (Internal-move offers are handled by
// renderInternalOfferLetter below.)
//
// RED = placeholder / sample. Everything shown in red is template or
// sample content (the stock legal language, or a field left blank) —
// NOT final. Real HR-entered values render in normal black. The stock
// legal language is placeholder and must be reviewed by counsel.
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
  employmentType?: string | null;
  baseSalary?: number | null;
  startDate?: string | null;
  location?: string | null;
  addendum?: OfferAddendumItem[];
}

const RED = 'color:#dc2626;';

// Wrap sample/placeholder content so it's visually unmistakable.
function ph(text: string): string {
  return `<span style="${RED}font-weight:600;">${text}</span>`;
}
// A whole block of sample (legal) language, in red.
function sample(text: string): string {
  return `<span style="${RED}">${text}</span>`;
}

function money(n?: number | null): string {
  if (n == null) return ph('[base salary]');
  return '$' + n.toLocaleString('en-US');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 16px 6px 0;color:#555;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111;">${value}</td>
  </tr>`;
}

export function renderOfferLetter(input: OfferLetterInput): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = `${input.firstName} ${input.lastName}`.trim();

  // Real values render black; blanks render as red placeholders.
  const titleVal = input.jobTitle ? esc(input.jobTitle) : ph('[title]');
  const startVal = input.startDate ? esc(input.startDate) : ph('[start date]');

  const details = [
    row('Position', titleVal),
    input.department ? row('Department', esc(input.department)) : '',
    input.reportsTo ? row('Reports to', esc(input.reportsTo)) : '',
    row('Employment type', esc(input.employmentType || 'Full-Time')),
    row('Base salary', money(input.baseSalary) + ' per year'),
    row('Start date', startVal),
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

  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;color:#1a1a1a;padding:32px 28px;">
    <div style="font-family:sans-serif;background:#fef2f2;border:1px solid #fecaca;${RED}font-size:12px;padding:8px 12px;border-radius:6px;margin-bottom:20px;">
      Anything shown in <strong>red</strong> is sample / placeholder content (template legal language or a blank field), not final. The stock legal language must be reviewed by counsel before use.
    </div>

    <div style="font-family:sans-serif;font-weight:800;font-size:18px;color:#111;">Lightspeed Systems</div>
    <div style="color:#888;font-size:13px;margin-bottom:24px;">${today}</div>

    <p style="font-size:15px;line-height:1.6;">Dear ${esc(input.firstName)},</p>

    <p style="font-size:15px;line-height:1.6;">On behalf of Lightspeed Systems, I am pleased to offer you the position of
    <strong>${titleVal}</strong>. We were impressed throughout the process and are excited about the contributions you will
    make to our team. The specific terms of your offer are below.</p>

    <table style="border-collapse:collapse;margin:8px 0 20px;">${details}</table>

    <p style="font-size:14px;line-height:1.6;">${sample('This offer of employment is contingent upon your ability to provide documentation establishing your identity and authorization to work, and upon the successful completion of any pre-employment checks required for the role.')}</p>

    <p style="font-size:14px;line-height:1.6;">${sample('Your employment with Lightspeed Systems is <strong>at will</strong>, meaning that either you or the company may end the employment relationship at any time, with or without cause or notice. This letter is not a contract of employment for any specific duration.')}</p>

    <p style="font-size:14px;line-height:1.6;">${sample("You will be eligible to participate in the company's standard benefit programs in accordance with the applicable plan terms, which may be amended from time to time.")}</p>

    <p style="font-size:14px;line-height:1.6;">${sample('To accept this offer, please sign and return this letter. This offer will remain open for five (5) business days from the date above.')}</p>

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

// ============================================================
// INTERNAL-MOVE OFFER LETTER — deterministic template renderer.
//
// For internal candidates (current employees moving to a new role).
// Per the manager meeting + flowchart node OINT: show a before/now
// side-by-side comparison (base, bonus $ or %, manager, department,
// stipends) so the employee sees exactly what changes, and put the
// transition plan on an ADDENDUM. Same rules as the external letter:
// editable fields in fixed places, fixed stock language, deterministic
// (NOT AI) so legal wording can't drift.
//
// "Current" comp comes from HR entry today (HRIS integration deferred —
// see IT Access list); blanks render as grey "—" placeholders. Stock
// legal language (red) must be reviewed by counsel.
// ============================================================

export interface CompComparison {
  currentTitle?: string | null;
  currentBaseSalary?: number | null;
  currentBonus?: string | null;       // free text — "$" amount or "%"
  currentManager?: string | null;
  currentDepartment?: string | null;
  currentStipends?: string | null;
  newTitle: string;
  newBaseSalary?: number | null;
  newBonus?: string | null;
  newManager?: string | null;
  newDepartment?: string | null;
  newStipends?: string | null;
}

export interface InternalOfferLetterInput {
  firstName: string;
  lastName: string;
  effectiveDate?: string | null;
  comp: CompComparison;
  addendum?: OfferAddendumItem[];
}

// Grey em-dash placeholder for an unknown comparison cell (distinct from
// the red legal placeholders).
function cell(text: string | null | undefined, isMoney = false): string {
  if (text == null || (typeof text === 'string' && !text.trim())) {
    return `<span style="color:#9ca3af;">&mdash;</span>`;
  }
  return isMoney ? text : esc(String(text));
}

function compRow(label: string, current: string, now: string, highlight = false): string {
  const bg = highlight ? 'background:#f0fdf4;' : '';
  return `<tr style="${bg}">
    <td style="padding:8px 14px 8px 0;color:#555;font-size:13px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eee;">${label}</td>
    <td style="padding:8px 14px 8px 0;font-size:13px;color:#444;vertical-align:top;border-bottom:1px solid #eee;">${current}</td>
    <td style="padding:8px 0;font-size:13px;font-weight:600;color:#111;vertical-align:top;border-bottom:1px solid #eee;">${now}</td>
  </tr>`;
}

export function renderInternalOfferLetter(input: InternalOfferLetterInput): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const name = `${input.firstName} ${input.lastName}`.trim();
  const c = input.comp;

  const newTitleVal = c.newTitle ? esc(c.newTitle) : ph('[new title]');
  const effVal = input.effectiveDate ? esc(input.effectiveDate) : ph('[effective date]');

  const curBase = c.currentBaseSalary != null ? '$' + c.currentBaseSalary.toLocaleString('en-US') + ' / yr' : null;
  const newBase = c.newBaseSalary != null ? '$' + c.newBaseSalary.toLocaleString('en-US') + ' / yr' : null;

  const rows = [
    compRow('Title', cell(c.currentTitle), cell(c.newTitle)),
    compRow('Base salary', cell(curBase, true), cell(newBase, true), true),
    compRow('Bonus ($ or %)', cell(c.currentBonus), cell(c.newBonus)),
    compRow('Manager', cell(c.currentManager), cell(c.newManager)),
    compRow('Department', cell(c.currentDepartment), cell(c.newDepartment)),
    compRow('Stipends', cell(c.currentStipends), cell(c.newStipends)),
    compRow('Effective date', `<span style="color:#9ca3af;">&mdash;</span>`, effVal),
  ].join('');

  const addendumHtml = (input.addendum && input.addendum.length)
    ? input.addendum.map((a, i) => `
      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#888;margin-bottom:6px;">Addendum ${String.fromCharCode(65 + i)}</div>
        <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px;">${esc(a.title)}</div>
        <div style="font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${esc(a.body)}</div>
      </div>`).join('')
    : '';

  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:660px;margin:0 auto;color:#1a1a1a;padding:32px 28px;">
    <div style="font-family:sans-serif;background:#fef2f2;border:1px solid #fecaca;${RED}font-size:12px;padding:8px 12px;border-radius:6px;margin-bottom:20px;">
      Anything shown in <strong>red</strong> is sample / placeholder content (template legal language or a blank field), not final. Comparison cells shown as &ldquo;&mdash;&rdquo; are current-role details HR still needs to enter (HRIS integration pending). The stock legal language must be reviewed by counsel before use.
    </div>

    <div style="font-family:sans-serif;font-weight:800;font-size:18px;color:#111;">Lightspeed Systems</div>
    <div style="color:#888;font-size:13px;margin-bottom:24px;">${today}</div>

    <p style="font-size:15px;line-height:1.6;">Dear ${esc(input.firstName)},</p>

    <p style="font-size:15px;line-height:1.6;">Congratulations! We are pleased to offer you an internal move to the position of
    <strong>${newTitleVal}</strong> at Lightspeed Systems. The table below shows how your role and compensation
    change from your current position to the new one. All other terms of your employment remain unchanged except
    as noted here or in any addendum.</p>

    <table style="border-collapse:collapse;width:100%;margin:14px 0 20px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:0 14px 6px 0;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#888;"></th>
          <th style="text-align:left;padding:0 14px 6px 0;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#888;">Current (before)</th>
          <th style="text-align:left;padding:0 0 6px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#166534;">New role (now)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="font-size:14px;line-height:1.6;">${sample('This internal transfer does not change the at-will nature of your employment. Either you or the company may end the employment relationship at any time, with or without cause or notice. This letter is not a contract of employment for any specific duration.')}</p>

    <p style="font-size:14px;line-height:1.6;">${sample('Your participation in company benefit programs continues in accordance with the applicable plan terms, adjusted for any changes to eligibility associated with your new role.')}</p>

    <p style="font-size:14px;line-height:1.6;">${sample('To accept this internal offer, please sign and return this letter. This offer will remain open for five (5) business days from the date above.')}</p>

    <p style="font-size:15px;line-height:1.6;margin-top:20px;">We are excited to see you take on this new role.</p>

    <div style="margin-top:28px;font-size:14px;line-height:1.9;">
      Sincerely,<br/>
      <strong>Lightspeed Systems</strong><br/>
      People &amp; Talent
    </div>

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:14px;line-height:2.2;">
      Accepted by: ______________________________<br/>
      ${esc(name)}<br/>
      Date: ______________________________
    </div>

    ${addendumHtml}
  </div>`;
}
