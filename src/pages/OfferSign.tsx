// ============================================================
// OFFER SIGN — candidate offer e-signature page (public tokenized link)
// Reached from the "Agree & sign" button in the offer email. The candidate
// reviews their offer letter, types their name to sign, and accepts. Signing
// auto-advances them to Hired; the role closes once its openings are filled.
// They can also decline the offer (the "Decline offer" button), which closes
// them out without sending a company-rejection email.
// ============================================================
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 4px 16px rgba(20,40,80,.05)' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box' };

// Module scope on purpose: a component defined INSIDE OfferSign got a new
// identity on every render, so each keystroke remounted this whole subtree and
// the input lost focus after one character. Keeping Shell stable fixes that.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fc', display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 760, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontWeight: 700, color: '#1f2733' }}>Lightspeed</span>
          <span style={{ color: '#5b6675', fontSize: 13 }}>Talent Assessment</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function OfferSign() {
  const { token = '' } = useParams();
  const [search] = useSearchParams();
  const view = trpc.candidates.offerSignView.useQuery({ token }, { enabled: !!token, retry: false });
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  // Decline flow: the button reveals a confirm panel (optional reason) before
  // it actually declines, so a stray click can't close the candidate out.
  const [declineMode, setDeclineMode] = useState(search.get('decline') === '1');
  const [declineReason, setDeclineReason] = useState('');
  const [declined, setDeclined] = useState(false);

  const accept = trpc.candidates.offerSignAccept.useMutation({ onSuccess: () => setDone(true) });
  const decline = trpc.candidates.offerDecline.useMutation({ onSuccess: () => setDeclined(true) });

  if (view.isLoading) return <Shell><div style={card}>Loading…</div></Shell>;
  if (view.error || !view.data) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This signing link is invalid or has expired.</div></div></Shell>;

  const d = view.data as any;

  if (done || d.alreadySigned) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <CheckCircle2 size={22} color="#15803d" />
          <h2 style={{ margin: 0, fontSize: 18 }}>Offer signed</h2>
        </div>
        <p style={{ color: '#5b6675', fontSize: 14, margin: 0 }}>
          Thank you{d.candidateName ? `, ${d.candidateName}` : ''} — your offer has been signed and accepted. Welcome to Lightspeed Systems! Our onboarding team will be in touch shortly.
        </p>
      </div></Shell>
    );
  }

  if (declined || d.alreadyDeclined) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <XCircle size={22} color="#b45309" />
          <h2 style={{ margin: 0, fontSize: 18 }}>Offer declined</h2>
        </div>
        <p style={{ color: '#5b6675', fontSize: 14, margin: 0 }}>
          Thank you for letting us know{d.candidateName ? `, ${d.candidateName}` : ''}. We've recorded that you're declining this offer. We wish you all the best, and hope our paths cross again.
        </p>
      </div></Shell>
    );
  }

  return (
    <Shell><div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Your offer from Lightspeed Systems</h2>
      <p style={{ color: '#5b6675', fontSize: 13, margin: '0 0 16px' }}>
        Review your offer below, then sign electronically. <strong>Signing accepts the offer.</strong>
      </p>

      {d.letterHtml
        ? <div style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '4px 16px', maxHeight: 420, overflowY: 'auto', marginBottom: 18 }} dangerouslySetInnerHTML={{ __html: d.letterHtml }} />
        : <p style={{ color: '#5b6675', fontSize: 14 }}>Your offer letter was sent to your email. Type your full name below to sign and accept.</p>}

      {!declineMode ? (
        <>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Type your full name to sign
          </label>
          <input style={inp} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Jade Friedman" />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0 0', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I have read and agree to the terms of this offer, and by typing my name and clicking below I am signing this offer electronically.</span>
          </label>

          {accept.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{accept.error.message}</p>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button
              onClick={() => accept.mutate({ token, signerName: signerName.trim() })}
              disabled={!signerName.trim() || !agreed || accept.isLoading}
              style={{
                padding: '12px 22px', fontSize: 14, fontWeight: 700, color: '#fff',
                background: (!signerName.trim() || !agreed || accept.isLoading) ? '#9ca3af' : '#15803d',
                border: 'none', borderRadius: 8, cursor: (!signerName.trim() || !agreed) ? 'not-allowed' : 'pointer',
              }}>
              {accept.isLoading ? 'Signing…' : 'Agree & sign'}
            </button>
            <button
              onClick={() => setDeclineMode(true)}
              style={{ padding: '12px 22px', fontSize: 14, fontWeight: 600, color: '#b91c1c', background: '#fff', border: '1px solid #f0a8a8', borderRadius: 8, cursor: 'pointer' }}>
              Decline offer
            </button>
          </div>
        </>
      ) : (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>Decline this offer?</div>
          <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 12px' }}>This lets our team know you won't be accepting. You can add a short note if you'd like (optional).</p>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{ ...inp, minHeight: 64, fontFamily: 'inherit' }}
          />
          {decline.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{decline.error.message}</p>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <button
              onClick={() => decline.mutate({ token, reason: declineReason.trim() || undefined })}
              disabled={decline.isLoading}
              style={{ padding: '12px 22px', fontSize: 14, fontWeight: 700, color: '#fff', background: decline.isLoading ? '#9ca3af' : '#b91c1c', border: 'none', borderRadius: 8, cursor: decline.isLoading ? 'not-allowed' : 'pointer' }}>
              {decline.isLoading ? 'Declining…' : 'Confirm decline'}
            </button>
            <button
              onClick={() => setDeclineMode(false)}
              style={{ padding: '12px 22px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer' }}>
              Back
            </button>
          </div>
        </div>
      )}
    </div></Shell>
  );
}
