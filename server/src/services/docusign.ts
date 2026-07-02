// ============================================================
// DOCUSIGN — send an offer letter for e-signature.
//
// The app already generates the offer letter; here we hand that
// document to DocuSign, which owns the signing ceremony (it emails
// the candidate a secure link, collects the signature, sends
// reminders, and reports completion back). DocuSign sends the
// signing request — NOT SendGrid.
//
// Env-gated like the rest: with no DocuSign credentials it runs in
// stub mode (does not send) so the flow is safe to wire before the
// account/API access (on the IT list) lands. A DocuSign developer
// sandbox can be used to test end-to-end first.
// ============================================================

const BASE_URL = process.env.DOCUSIGN_BASE_URL ?? '';         // e.g. account base_uri (https://xxxx.docusign.net)
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID ?? '';
const ACCESS_TOKEN = process.env.DOCUSIGN_ACCESS_TOKEN ?? ''; // OAuth bearer token

export function isDocuSignConfigured(): boolean {
  return Boolean(BASE_URL && ACCOUNT_ID && ACCESS_TOKEN);
}

export interface OfferEnvelopeInput {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  letterHtml: string;
}

export interface OfferEnvelopeResult {
  configured: boolean;      // false = DocuSign creds not set (stub, nothing sent)
  envelopeId?: string;
  status?: string;
  error?: string;
}

export async function createOfferEnvelope(input: OfferEnvelopeInput): Promise<OfferEnvelopeResult> {
  if (!isDocuSignConfigured()) {
    console.log(`[DocuSign STUB] would send offer to ${input.candidateEmail} (no credentials configured)`);
    return { configured: false };
  }

  const documentBase64 = Buffer.from(input.letterHtml, 'utf8').toString('base64');
  const body = {
    emailSubject: `Your offer from Lightspeed Systems — ${input.jobTitle}`,
    documents: [
      { documentBase64, name: `Offer Letter — ${input.jobTitle}.html`, fileExtension: 'html', documentId: '1' },
    ],
    recipients: {
      signers: [
        {
          email: input.candidateEmail,
          name: input.candidateName,
          recipientId: '1',
          routingOrder: '1',
          // Anchor the signature + date onto the letter's existing "Accepted by:" / "Date:" lines.
          tabs: {
            signHereTabs: [{ anchorString: 'Accepted by:', anchorUnits: 'pixels', anchorXOffset: '90', anchorYOffset: '-6' }],
            dateSignedTabs: [{ anchorString: 'Date:', anchorUnits: 'pixels', anchorXOffset: '40', anchorYOffset: '-6' }],
          },
        },
      ],
    },
    status: 'sent', // 'sent' emails the candidate immediately; 'created' would leave it as a draft
  };

  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { configured: true, error: `DocuSign ${res.status}: ${text || res.statusText}` };
    }
    const data = (await res.json()) as any;
    return { configured: true, envelopeId: data.envelopeId, status: data.status };
  } catch (err: any) {
    return { configured: true, error: err?.message ?? String(err) };
  }
}
