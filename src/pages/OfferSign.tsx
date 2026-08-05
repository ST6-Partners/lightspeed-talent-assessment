// ============================================================
// OFFER SIGN — candidate offer e-signature page (public tokenized link)
// Reached from the "Agree & sign" button in the offer email. The candidate
// reviews their offer letter, types their name to sign, and accepts. Signing
// auto-advances them to Hired; the role closes once its openings are filled.
// ============================================================
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function OfferSign() {
  const { token = '' } = useParams();
  const view = trpc.candidates.offerSignView.useQuery({ token }, { enabled: !!token, retry: false });
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);

  const accept = trpc.candidates.offerSignAccept.useMutation({ onSuccess: () => setDone(true) });

  const Shell = ({ children }: { children: React.ReactNode }) => (
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
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 4px 16px rgba(20,40,80,.05)' };
  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box' };

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

  return (
    <Shell><div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Your offer from Lightspeed Systems</h2>
      <p style={{ color: '#5b6675', fontSize: 13, margin: '0 0 16px' }}>
        Review your offer below, then sign electronically. <strong>Signing accepts the offer.</strong>
      </p>

      {d.letterHtml
        ? <div style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '4px 16px', maxHeight: 420, overflowY: 'auto', marginBottom: 18 }} dangerouslySetInnerHTML={{ __html: d.letterHtml }} />
        : <p style={{ color: '#5b6675', fontSize: 14 }}>Your offer letter was sent to your email. Type your full name below to sign and accept.</p>}

      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.03em' }}>
        Type your full name to sign
      </label>
      <input style={inp} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Jade Friedman" />

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0 0', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I have read and agree to the terms of this offer, and by typing my name and clicking below I am signing this offer electronically.</span>
      </label>

      {accept.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{accept.error.message}</p>}

      <button
        onClick={() => accept.mutate({ token, signerName: signerName.trim() })}
        disabled={!signerName.trim() || !agreed || accept.isLoading}
        style={{
          marginTop: 16, padding: '12px 22px', fontSize: 14, fontWeight: 700, color: '#fff',
          background: (!signerName.trim() || !agreed || accept.isLoading) ? '#9ca3af' : '#15803d',
          border: 'none', borderRadius: 8, cursor: (!signerName.trim() || !agreed) ? 'not-allowed' : 'pointer',
        }}>
        {accept.isLoading ? 'Signing…' : 'Agree & sign'}
      </button>
    </div></Shell>
  );
}
