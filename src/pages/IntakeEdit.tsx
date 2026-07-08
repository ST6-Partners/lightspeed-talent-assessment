// ============================================================
// INTAKE EDIT — submitter self-service page (public tokenized link)
// Reached from the "sent back for edits" email. Shows the reviewer's note,
// lets the hiring team edit the intake in place, then Save or Re-submit —
// without hunting down the original intake form. token = requisition id.
// ============================================================
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, PencilLine } from 'lucide-react';
import { trpc } from '../lib/trpc';

const PRIORITY = ['Low', 'Medium', 'High', 'Critical'];
const EMPLOYMENT = ['Full-Time', 'Part-Time', 'Contract', 'Internship'];
const ARRANGEMENT = ['On-site', 'Hybrid', 'Remote'];
const TIMELINE = ['standard', 'senior', 'custom'];

export default function IntakeEdit() {
  const { token = '' } = useParams();
  const view = trpc.intake.editView.useQuery({ token }, { enabled: !!token, retry: false });
  const [f, setF] = useState<any>(null);
  const [done, setDone] = useState<null | { kind: 'saved' | 'resubmitted'; msg: string }>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (view.data?.requisition) {
      const r: any = view.data.requisition;
      setF({
        reasonType: r.reasonType ?? '', roleChangeNote: r.roleChangeNote ?? '',
        department: r.department ?? '', hiringManager: r.hiringManager ?? '',
        numOpenings: r.numOpenings ?? 1, priority: r.priority ?? 'Medium',
        employmentType: r.employmentType ?? 'Full-Time', location: r.location ?? '',
        workArrangement: r.workArrangement ?? 'On-site', hybridDays: r.hybridDays ?? '',
        salaryMin: r.salaryMin ?? '', salaryMax: r.salaryMax ?? '', variableComp: r.variableComp ?? '',
        mustHaves: r.mustHaves ?? '', niceToHaves: r.niceToHaves ?? '', knownConstraints: r.knownConstraints ?? '',
        timelineTemplate: r.timelineTemplate ?? 'standard', targetOfferDate: r.targetOfferDate ?? '',
        teamAvailabilityConfirmed: !!r.teamAvailabilityConfirmed,
      });
    }
  }, [view.data]);

  const payload = () => ({
    token,
    reasonType: f.reasonType || undefined, roleChangeNote: f.roleChangeNote || undefined,
    department: f.department || undefined, hiringManager: f.hiringManager || undefined,
    numOpenings: f.numOpenings ? Number(f.numOpenings) : undefined, priority: f.priority || undefined,
    employmentType: f.employmentType || undefined, location: f.location || undefined,
    workArrangement: f.workArrangement || undefined, hybridDays: f.hybridDays !== '' ? Number(f.hybridDays) : undefined,
    salaryMin: f.salaryMin !== '' ? Number(f.salaryMin) : undefined, salaryMax: f.salaryMax !== '' ? Number(f.salaryMax) : undefined,
    variableComp: f.variableComp || undefined,
    mustHaves: f.mustHaves || undefined, niceToHaves: f.niceToHaves || undefined, knownConstraints: f.knownConstraints || undefined,
    timelineTemplate: f.timelineTemplate || undefined, targetOfferDate: f.targetOfferDate || undefined,
    teamAvailabilityConfirmed: !!f.teamAvailabilityConfirmed,
  });

  const save = trpc.intake.editSave.useMutation({ onSuccess: () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); } });
  const resubmit = trpc.intake.editResubmit.useMutation({ onSuccess: () => setDone({ kind: 'resubmitted', msg: 'Saved and re-submitted. The approval chain has restarted from the first approver.' }) });
  const err = save.error?.message || resubmit.error?.message;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', background: '#f7f9fc', display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 720, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontWeight: 700, color: '#1f2733' }}>Lightspeed</span>
          <span style={{ color: '#5b6675', fontSize: 13 }}>Talent Assessment</span>
        </div>
        {children}
      </div>
    </div>
  );
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 4px 16px rgba(20,40,80,.05)' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', margin: '12px 0 3px' };
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' };
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const btn = (bg: string): React.CSSProperties => ({ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 7, border: 'none', background: bg, color: '#fff', cursor: 'pointer' });
  const btnGhost: React.CSSProperties = { padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' };
  const F = ({ label, k, type = 'text' }: { label: string; k: string; type?: string }) =>
    <div><label style={lbl}>{label}</label><input style={inp} type={type} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>;
  const S = ({ label, k, opts }: { label: string; k: string; opts: string[] }) =>
    <div><label style={lbl}>{label}</label><select style={inp} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  const T = ({ label, k }: { label: string; k: string }) =>
    <div><label style={lbl}>{label}</label><textarea rows={3} style={inp} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>;

  if (view.isLoading) return <Shell><div style={card}>Loading...</div></Shell>;
  if (view.error || !view.data) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This edit link is invalid or has expired.</div></div></Shell>;

  if (done) {
    return <Shell><div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><CheckCircle2 size={22} color="#15803d" /><h2 style={{ margin: 0, fontSize: 18 }}>Re-submitted</h2></div>
      <p style={{ color: '#4b5563', fontSize: 14, margin: 0 }}>{done.msg}</p>
      <p style={{ color: '#9aa6b6', fontSize: 12 }}>You can close this window.</p>
    </div></Shell>;
  }

  if (!view.data.canEdit) {
    return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#6b7280' }}><AlertCircle size={18} /> This intake is no longer editable from this link (it is back in the approval chain).</div></div></Shell>;
  }

  if (!f) return <Shell><div style={card}>Loading...</div></Shell>;

  return <Shell>
    {view.data.reviewNote && (
      <div style={{ ...card, marginBottom: 14, background: '#fffbeb', borderColor: '#fde68a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400e', fontWeight: 700, fontSize: 14 }}><PencilLine size={16} /> Sent back for edits{view.data.reviewedBy ? ` by ${view.data.reviewedBy}` : ''}</div>
        <p style={{ color: '#78350f', fontSize: 14, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{view.data.reviewNote}</p>
      </div>
    )}
    <div style={card}>
      <h2 style={{ margin: '0 0 2px', fontSize: 18 }}>Review &amp; edit: {f.department || 'intake'}</h2>
      <p style={{ color: '#5b6675', fontSize: 13, margin: 0 }}>Edit the intake below and re-submit. This is the same intake that was sent for approval; changes save in place.</p>

      <div style={grid2}>
        {S({ label: 'Department', k: 'department', opts: [f.department || '', 'Engineering', 'Product', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'Customer Success', 'Legal', 'Other'].filter((v, i, a) => v && a.indexOf(v) === i) })}
        {F({ label: 'Hiring manager', k: 'hiringManager' })}
        {F({ label: 'Number of openings', k: 'numOpenings', type: 'number' })}
        {S({ label: 'Priority', k: 'priority', opts: PRIORITY })}
        {S({ label: 'Employment type', k: 'employmentType', opts: EMPLOYMENT })}
        {S({ label: 'Work arrangement', k: 'workArrangement', opts: ARRANGEMENT })}
        {F({ label: 'Location', k: 'location' })}
        {F({ label: 'Hybrid days in office', k: 'hybridDays', type: 'number' })}
        {F({ label: 'Salary min', k: 'salaryMin', type: 'number' })}
        {F({ label: 'Salary max', k: 'salaryMax', type: 'number' })}
        {F({ label: 'Variable comp', k: 'variableComp' })}
        {S({ label: 'Timeline', k: 'timelineTemplate', opts: TIMELINE })}
      </div>
      {T({ label: 'Must-haves', k: 'mustHaves' })}
      {T({ label: 'Nice-to-haves', k: 'niceToHaves' })}
      {T({ label: 'Known constraints', k: 'knownConstraints' })}
      {(f.reasonType === 'replacement_diff' || f.reasonType === 'termination_diff' || f.reasonType === 'new_headcount') && F({ label: f.reasonType === 'new_headcount' ? 'Describe the new role' : 'How the role should differ', k: 'roleChangeNote' })}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#374151' }}>
        <input type="checkbox" checked={!!f.teamAvailabilityConfirmed} onChange={(e) => setF({ ...f, teamAvailabilityConfirmed: e.target.checked })} />
        Interview team availability confirmed (required to re-submit)
      </label>

      {err && <p style={{ color: '#b91c1c', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
      {savedFlash && <p style={{ color: '#15803d', fontSize: 13, margin: '12px 0 0' }}>Saved.</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button style={{ ...btn('#15803d'), opacity: resubmit.isLoading ? 0.6 : 1 }} disabled={resubmit.isLoading || save.isLoading} onClick={() => resubmit.mutate(payload() as any)}>{resubmit.isLoading ? 'Re-submitting...' : 'Save & re-submit'}</button>
        <button style={btnGhost} disabled={save.isLoading || resubmit.isLoading} onClick={() => save.mutate(payload() as any)}>{save.isLoading ? 'Saving...' : 'Save (keep editing)'}</button>
      </div>
    </div>
  </Shell>;
}
