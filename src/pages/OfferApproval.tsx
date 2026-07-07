// ============================================================
// OFFER APPROVAL — hiring-manager review page (public tokenized link)
// Reached from the test inbox ("Open, review & sign off"). Handles both
// external offers and internal-move offers (kind). The manager reviews the
// draft, edits any field or the standard legal language, then signs off
// (which sends it to the candidate/employee) or sends it back.
// ============================================================
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function OfferApproval() {
  const { token = '' } = useParams();
  const view = trpc.candidates.offerApprovalView.useQuery({ token }, { enabled: !!token, retry: false });

  const [p, setP] = useState<any>(null);
  const [html, setHtml] = useState<string>('');
  const [managerName, setManagerName] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<null | { kind: 'approved' | 'sent_back'; msg: string }>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => { if (view.data) { setP(view.data.payload); setHtml(view.data.html); } }, [view.data]);

  const save = trpc.candidates.offerApprovalSaveEdits.useMutation({
    onSuccess: (r) => { setHtml(r.html); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000); },
  });
  const decide = trpc.candidates.offerApprovalDecide.useMutation({
    onSuccess: (r) => setDone(r.status === 'approved'
      ? { kind: 'approved', msg: 'Signed off — the offer letter has been sent.' }
      : { kind: 'sent_back', msg: 'Sent back to the hiring team. The candidate was not contacted.' }),
  });
  const err = save.error?.message || decide.error?.message;

  const kind: string = view.data?.kind ?? 'external';
  const setTop = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  const setComp = (k: string, v: any) => setP((prev: any) => ({ ...prev, comp: { ...(prev?.comp ?? {}), [k]: v } }));
  const setClause = (i: number, v: string) => setP((prev: any) => ({ ...prev, legalClauses: (prev?.legalClauses ?? []).map((x: string, j: number) => j === i ? v : x) }));
  const num = (v: string) => { const n = v.replace(/[^0-9]/g, ''); return n ? parseInt(n) : null; };

  const doSave = () => save.mutate({ token, payload: p });
  const approve = () => { save.mutate({ token, payload: p }); decide.mutate({ token, action: 'approve', managerName: managerName || undefined }); };
  const sendBack = () => decide.mutate({ token, action: 'send_back', managerName: managerName || undefined, note: note || undefined });

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
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', margin: '10px 0 3px' };
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' };
  const btn = (bg: string): React.CSSProperties => ({ padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 7, border: 'none', background: bg, color: '#fff', cursor: 'pointer' });
  const btnGhost: React.CSSProperties = { padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' };
  const F = ({ label, val, on }: { label: string; val: any; on: (v: string) => void }) => (
    <div><label style={lbl}>{label}</label><input style={inp} value={val ?? ''} onChange={(e) => on(e.target.value)} /></div>
  );

  if (view.isLoading) return <Shell><div style={card}>Loading…</div></Shell>;
  if (view.error || !view.data || !p) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This approval link is invalid or has expired.</div></div></Shell>;

  if (done) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          {done.kind === 'approved' ? <CheckCircle2 size={22} color="#15803d" /> : <XCircle size={22} color="#b45309" />}
          <h2 style={{ margin: 0, fontSize: 18 }}>{done.kind === 'approved' ? 'Offer approved & sent' : 'Offer sent back'}</h2>
        </div>
        <p style={{ color: '#4b5563', fontSize: 14 }}>{done.msg}</p>
        <p style={{ color: '#9aa6b6', fontSize: 12 }}>You can close this window.</p>
      </div></Shell>
    );
  }
  if (view.data.status !== 'pending') {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', gap: 8, color: '#6b7280' }}><AlertCircle size={18} /> This offer has already been {view.data.status === 'approved' ? 'approved and sent' : 'sent back'}{view.data.managerName ? ` by ${view.data.managerName}` : ''}.</div>
        {view.data.managerNote && <p style={{ fontSize: 13, color: '#4b5563', marginTop: 10 }}><strong>Note:</strong> {view.data.managerNote}</p>}
      </div></Shell>
    );
  }

  const clauses: string[] = p.legalClauses ?? [];
  const isInternal = kind === 'internal';
  return (
    <Shell>
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Approve {isInternal ? 'internal move' : 'offer'} for {view.data.candidateName}</h2>
        <p style={{ color: '#5b6675', fontSize: 13, margin: 0 }}>Review and edit the draft below, then sign off to send it — or send it back to the hiring team. Nothing is sent to the {isInternal ? 'employee' : 'candidate'} until you sign off.</p>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        {!isInternal ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Position / title" val={p.jobTitle} on={(v) => setTop('jobTitle', v)} />
            <F label="Reports to" val={p.reportsTo} on={(v) => setTop('reportsTo', v)} />
            <F label="Department" val={p.department} on={(v) => setTop('department', v)} />
            <F label="Employment type" val={p.employmentType} on={(v) => setTop('employmentType', v)} />
            <div><label style={lbl}>Base salary (annual, number)</label><input style={inp} value={p.baseSalary ?? ''} onChange={(e) => setTop('baseSalary', num(e.target.value))} /></div>
            <F label="Variable compensation" val={p.variableComp} on={(v) => setTop('variableComp', v)} />
            <F label="Start date" val={p.startDate} on={(v) => setTop('startDate', v)} />
            <F label="Location" val={p.location} on={(v) => setTop('location', v)} />
          </div>
        ) : (
          <>
            <F label="Effective date" val={p.effectiveDate} on={(v) => setTop('effectiveDate', v)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Current (before)</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>New role (now)</div>
              <F label="Current title" val={p.comp?.currentTitle} on={(v) => setComp('currentTitle', v)} />
              <F label="New title" val={p.comp?.newTitle} on={(v) => setComp('newTitle', v)} />
              <div><label style={lbl}>Current base (number)</label><input style={inp} value={p.comp?.currentBaseSalary ?? ''} onChange={(e) => setComp('currentBaseSalary', num(e.target.value))} /></div>
              <div><label style={lbl}>New base (number)</label><input style={inp} value={p.comp?.newBaseSalary ?? ''} onChange={(e) => setComp('newBaseSalary', num(e.target.value))} /></div>
              <F label="Current bonus ($ or %)" val={p.comp?.currentBonus} on={(v) => setComp('currentBonus', v)} />
              <F label="New bonus ($ or %)" val={p.comp?.newBonus} on={(v) => setComp('newBonus', v)} />
              <F label="Current manager" val={p.comp?.currentManager} on={(v) => setComp('currentManager', v)} />
              <F label="New manager" val={p.comp?.newManager} on={(v) => setComp('newManager', v)} />
              <F label="Current department" val={p.comp?.currentDepartment} on={(v) => setComp('currentDepartment', v)} />
              <F label="New department" val={p.comp?.newDepartment} on={(v) => setComp('newDepartment', v)} />
              <F label="Current stipends" val={p.comp?.currentStipends} on={(v) => setComp('currentStipends', v)} />
              <F label="New stipends" val={p.comp?.newStipends} on={(v) => setComp('newStipends', v)} />
            </div>
          </>
        )}

        <label style={lbl}>Legal language (edit to fix mistakes)</label>
        {clauses.map((c, i) => (
          <textarea key={i} value={c} rows={2} style={{ ...inp, marginBottom: 6, fontFamily: 'inherit' }} onChange={(e) => setClause(i, e.target.value)} />
        ))}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button style={btnGhost} disabled={save.isLoading} onClick={doSave}>{save.isLoading ? 'Saving…' : 'Save edits & refresh preview'}</button>
          {savedFlash && <span style={{ color: '#15803d', fontSize: 13 }}>Saved.</span>}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Preview</div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 480, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div style={card}>
        <label style={lbl}>Your name (optional)</label>
        <input style={inp} value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Jordan Rivera" />
        <label style={lbl}>Note (required to send back)</label>
        <textarea style={{ ...inp, fontFamily: 'inherit' }} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" />
        {err && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button style={{ ...btn('#15803d'), opacity: decide.isLoading ? 0.6 : 1 }} disabled={decide.isLoading} onClick={approve}>Approve &amp; send</button>
          <button style={{ ...btn('#b45309'), opacity: decide.isLoading || !note.trim() ? 0.6 : 1 }} disabled={decide.isLoading || !note.trim()} onClick={sendBack}>Send back</button>
        </div>
      </div>
    </Shell>
  );
}
