import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

const BADGE: Record<string, string> = {
  pending: 'background:#f3f4f6;color:#6b7280',
  approved: 'background:#dcfce7;color:#15803d',
  rejected: 'background:#fee2e2;color:#b91c1c',
};
const money = (n: any) => (n != null ? `$${Number(n).toLocaleString()}` : '—');

export default function Approve() {
  const { token = '' } = useParams();
  const [note, setNote] = useState('');
  const [done, setDone] = useState<null | { kind: 'approved' | 'rejected'; msg: string }>(null);

  const { data, isLoading, error, refetch } = trpc.intake.approvalView.useQuery({ token }, { enabled: !!token, retry: false });
  const approve = trpc.intake.approveViaToken.useMutation({
    onSuccess: (r: any) => setDone({ kind: 'approved', msg: r.fullyApproved ? 'Approved — this was the final approval, the intake is now fully approved.' : `Approved as ${r.roleLabel}. It now moves to the next approver.` }),
  });
  const reject = trpc.intake.rejectViaToken.useMutation({
    onSuccess: () => setDone({ kind: 'rejected', msg: 'Rejected — the intake has been sent back to the hiring team as a draft.' }),
  });
  const err = approve.error?.message || reject.error?.message;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', background: '#f7f9fc', display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 640, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontWeight: 700, color: '#1f2733' }}>Lightspeed</span>
          <span style={{ color: '#5b6675', fontSize: 13 }}>Talent Assessment</span>
        </div>
        {children}
      </div>
    </div>
  );
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 4px 16px rgba(20,40,80,.05)' };

  if (isLoading) return <Shell><div style={card}>Loading…</div></Shell>;
  if (error || !data) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This approval link is invalid or has expired.</div></div></Shell>;

  if (done) {
    return (
      <Shell>
        <div style={card}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            {done.kind === 'approved' ? <CheckCircle2 size={22} color="#15803d" /> : <XCircle size={22} color="#b91c1c" />}
            <h2 style={{ margin: 0, fontSize: 18 }}>{done.kind === 'approved' ? 'Approval recorded' : 'Rejection recorded'}</h2>
          </div>
          <p style={{ color: '#4b5563', fontSize: 14 }}>{done.msg}</p>
          <p style={{ color: '#9aa6b6', fontSize: 12 }}>You can close this window.</p>
        </div>
      </Shell>
    );
  }

  const r: any = data.requisition;
  const rows: Array<[string, string]> = [
    ['Department', r.department ?? '—'],
    ['Hiring manager', r.hiringManager ?? '—'],
    ['Openings', String(r.numOpenings ?? 1)],
    ['Priority', r.priority ?? '—'],
    ['Employment', `${r.employmentType ?? '—'}${r.workArrangement ? ' · ' + r.workArrangement : ''}${r.workArrangement === 'Hybrid' && r.hybridDays != null ? ` (${r.hybridDays} days in office)` : ''}`],
    ['Location', r.location || '—'],
    ['Salary range', `${money(r.salaryMin)} – ${money(r.salaryMax)}`],
    ...(r.variableComp ? [['Variable comp', r.variableComp] as [string, string]] : []),
    ['Interview rounds', String(r.interviewRounds ?? 1)],
    ['Timeline', `${r.timelineTemplate ?? 'standard'}${r.targetOfferDate ? ' · offer by ' + r.targetOfferDate : ''}`],
  ];

  return (
    <Shell>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2b6cb0', fontWeight: 700 }}>Intake approval</div>
        <h1 style={{ fontSize: 22, margin: '4px 0 2px' }}>{r.department} intake</h1>
        <p style={{ color: '#5b6675', fontSize: 13, margin: 0 }}>Your approval is requested as <strong>{data.roleLabel}</strong> (step {data.step} of {data.chain.length}).</p>

        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0 4px' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13, color: '#666', whiteSpace: 'nowrap', width: 150 }}>{k}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.rounds?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#33465c', marginBottom: 4 }}>Interview plan</div>
            {data.rounds.map((rd: any) => (
              <div key={rd.id} style={{ fontSize: 13, color: '#4b5563' }}>• {rd.roundName}{rd.lengthMin ? ` · ${rd.lengthMin} min` : ''}{rd.format ? ` · ${rd.format}` : ''}</div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#33465c', marginBottom: 6 }}>Approval chain</div>
          {data.chain.map((c: any) => (
            <div key={c.step} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span style={{ color: '#4b5563' }}>{c.step}. {c.roleLabel}{c.note ? ` — ${c.note}` : ''}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20, ...styleObj(BADGE[c.status]) }}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        {data.isCurrentStep ? (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', display: 'block', marginBottom: 6 }}>Note (required to reject, optional to approve)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" style={{ width: '100%', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginBottom: 10 }} />
            {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => approve.mutate({ token, note: note || undefined })}
                disabled={approve.isLoading || reject.isLoading}
                style={{ padding: '10px 20px', background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >{approve.isLoading ? 'Approving…' : `Approve as ${data.roleLabel}`}</button>
              <button
                onClick={() => { if (!note.trim()) { reject.reset(); approve.reset(); setNote(note); alert('Please add a reason to reject.'); return; } reject.mutate({ token, note }); }}
                disabled={approve.isLoading || reject.isLoading}
                style={{ padding: '10px 20px', background: '#fff', color: '#b91c1c', border: '1px solid #f3c9c9', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >Reject</button>
            </div>
          </>
        ) : (
          <div style={{ color: '#5b6675', fontSize: 14 }}>
            {data.stepStatus === 'approved' ? 'You have already approved this step. Thank you.' :
             data.stepStatus === 'rejected' ? 'This step was rejected; the intake went back to the hiring team.' :
             'This step is not yet active — an earlier approver still needs to act. You will be able to approve once it reaches your step.'}
            <div style={{ marginTop: 8 }}><button onClick={() => refetch()} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Refresh</button></div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function styleObj(css: string): React.CSSProperties {
  const o: any = {};
  css.split(';').forEach((d) => { const [k, v] = d.split(':'); if (k && v) o[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim(); });
  return o;
}
