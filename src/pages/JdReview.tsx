// ============================================================
// JD REVIEW — hiring-manager sign-off page (public tokenized link)
// Reached from the "New JD to review & sign off" email. The manager reviews the
// AI-authored JD (summary, responsibilities, qualifications, work sample, EPP
// values, interview questions) and signs off. Nothing opens and no kickoff is
// sent until sign-off; approving here opens the role + fires the hiring kickoff.
// ============================================================
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function JdReview() {
  const { token = '' } = useParams();
  const view = trpc.intake.jdReviewView.useQuery({ token }, { enabled: !!token, retry: false });
  const [approverName, setApproverName] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const approve = trpc.intake.jdReviewApprove.useMutation({
    onSuccess: (r) => setDone(r.jobTitle || 'the role'),
  });

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
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', margin: '16px 0 4px', textTransform: 'uppercase', letterSpacing: '.03em' };
  const body: React.CSSProperties = { fontSize: 14, color: '#1f2733', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 };
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' };

  if (view.isLoading) return <Shell><div style={card}>Loading...</div></Shell>;
  if (view.error || !view.data) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This review link is invalid or has expired.</div></div></Shell>;

  const d = view.data as any;
  const jd = d.jd;
  const values: string[] = Array.isArray(jd.eppValues) ? jd.eppValues : [];
  const questions: any[] = Array.isArray(d.questions) ? d.questions : [];

  if (done) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <CheckCircle2 size={22} color="#15803d" />
          <h2 style={{ margin: 0, fontSize: 18 }}>JD approved</h2>
        </div>
        <p style={{ color: '#5b6675', fontSize: 14, margin: 0 }}>Signed off on <strong>{done}</strong>. The role is now open and the hiring kickoff has been sent to the team.</p>
      </div></Shell>
    );
  }

  if (d.alreadyDecided) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', gap: 8, color: '#6b7280' }}><AlertCircle size={18} /> This job description has already been approved.</div>
      </div></Shell>
    );
  }

  const Section = ({ label, text }: { label: string; text?: string | null }) =>
    text ? <div><div style={lbl}>{label}</div><p style={body}>{text}</p></div> : null;

  return (
    <Shell><div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Review &amp; sign off: {jd.jobTitle}</h2>
      <p style={{ color: '#5b6675', fontSize: 13, margin: 0 }}>
        {[d.department, d.hiringManager].filter(Boolean).join(' · ')}
      </p>
      <p style={{ color: '#5b6675', fontSize: 13, margin: '8px 0 0' }}>
        Review the AI-drafted job description below, then sign off. <strong>The role stays closed and no hiring kickoff is sent until you approve.</strong>
      </p>

      <Section label="Summary" text={jd.summary} />
      <Section label="Responsibilities" text={jd.responsibilities} />
      <Section label="Required qualifications" text={jd.requiredQualifications} />
      <Section label="Preferred qualifications" text={jd.preferredQualifications} />
      <Section label="Work sample" text={jd.workSampleInstructions} />

      {values.length > 0 && (
        <div><div style={lbl}>EPP values match</div><p style={body}>{values.join(', ')}</p></div>
      )}

      {questions.length > 0 && (
        <div>
          <div style={lbl}>Standard interview questions</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#1f2733', lineHeight: 1.6 }}>
            {questions.map((q, i) => <li key={i}>{q.question}{q.category ? <span style={{ color: '#9ca3af' }}> ({q.category})</span> : null}</li>)}
          </ol>
        </div>
      )}

      <div style={{ marginTop: 20, borderTop: '1px solid #eef2f7', paddingTop: 16 }}>
        <label style={{ ...lbl, marginTop: 0 }}>Your name (optional)</label>
        <input style={inp} value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="e.g. Jade Friedman" />
        {approve.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{approve.error.message}</p>}
        <div style={{ marginTop: 14 }}>
          <button
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 7, border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer', opacity: approve.isLoading ? 0.6 : 1 }}
            disabled={approve.isLoading}
            onClick={() => approve.mutate({ token, approverName: approverName || undefined })}
          >
            {approve.isLoading ? 'Approving...' : 'Approve JD & open the role'}
          </button>
        </div>
      </div>
    </div></Shell>
  );
}
