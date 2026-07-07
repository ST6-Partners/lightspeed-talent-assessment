// ============================================================
// ADOBE SIGN (Adobe Acrobat Sign) — send an offer letter for
// e-signature. Company standard per IT (replaces DocuSign).
//
// Same shape as before: the app generates the offer letter, Adobe
// Sign owns the signing ceremony (emails the candidate a secure
// link, collects the signature, sends reminders, reports back).
//
// Adobe Sign v6 is a two-step flow: upload the letter as a
// "transient document", then create an "agreement" that sends it
// for signature. Env-gated: with no credentials it runs in stub
// mode (does not send) so the flow is safe to wire before the
// account/API access (on the IT list) lands.
// ============================================================

const BASE_URL = process.env.ADOBE_SIGN_BASE_URL ?? '';         // region API base, e.g. https://api.na1.adobesign.com
const ACCESS_TOKEN = process.env.ADOBE_SIGN_ACCESS_TOKEN ?? ''; // integration key / OAuth bearer token

export function isAdobeSignConfigured(): boolean {
  return Boolean(BASE_URL && ACCESS_TOKEN);
}

export interface OfferAgreementInput {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  letterHtml: string;
}

export interface OfferAgreementResult {
  configured: boolean;      // false = Adobe Sign creds not set (stub, nothing sent)
  agreementId?: string;
  status?: string;
  error?: string;
}

function apiBase(): string {
  const b = BASE_URL.replace(/\/$/, '');
  return b.endsWith('/api/rest/v6') ? b : `${b}/api/rest/v6`;
}

// Step 1: upload the letter as a transient document, get its id.
async function uploadTransientDocument(letterHtml: string, jobTitle: string): Promise<string> {
  const form = new FormData();
  form.append('File-Name', `Offer Letter - ${jobTitle}.html`);
  form.append('Mime-Type', 'text/html');
  form.append('File', new Blob([letterHtml], { type: 'text/html' }), `offer-${Date.now()}.html`);

  const res = await fetch(`${apiBase()}/transientDocuments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`transientDocuments ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as any;
  return data.transientDocumentId as string;
}

// Step 2: create the agreement (state IN_PROCESS emails the signer immediately).
export async function createOfferAgreement(input: OfferAgreementInput): Promise<OfferAgreementResult> {
  if (!isAdobeSignConfigured()) {
    console.log(`[AdobeSign STUB] would send offer to ${input.candidateEmail} (no credentials configured)`);
    return { configured: false };
  }

  try {
    const transientDocumentId = await uploadTransientDocument(input.letterHtml, input.jobTitle);
    const body = {
      fileInfos: [{ transientDocumentId }],
      name: `Your offer from Lightspeed Systems - ${input.jobTitle}`,
      participantSetsInfo: [
        { order: 1, role: 'SIGNER', memberInfos: [{ email: input.candidateEmail }] },
      ],
      signatureType: 'ESIGN',
      state: 'IN_PROCESS', // 'AUTHORING' would leave it as a draft instead of sending
    };

    const res = await fetch(`${apiBase()}/agreements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { configured: true, error: `Adobe Sign ${res.status}: ${text || res.statusText}` };
    }
    const data = (await res.json()) as any;
    return { configured: true, agreementId: data.id, status: 'IN_PROCESS' };
  } catch (err: any) {
    return { configured: true, error: err?.message ?? String(err) };
  }
}
