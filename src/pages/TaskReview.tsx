// ============================================================
// TASK REVIEW — approver sign-off page (public tokenized link)
// Reached from the "Review & approve a new work sample" email. The approver
// reviews the task (brief, show-your-work, both scoring guides), can edit the
// text, then approves. A task stays Draft and unusable on any role until it's
// approved here (or via the in-app Approve action).
// ============================================================
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function TaskReview() {
  const { token = '' } = useParams();
  const view = trpc.tasks.reviewView.useQuery({ token }, { enabled: !!token, retry: false });
  const [done, setDone] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [edits, setEdits] = useState({
    title: '', brief: '', showYourWorkInstructions: '', scoringGuideWork: '', scoringGuideAi: '',
  });

  // Prefill the editable fields once the task loads.
  useEffect(() => {
    const t = (view.data as any)?.task;
    if (t) setEdits({
      title: t.title ?? '',
      brief: t.brief ?? '',
      showYourWorkInstructions: t.showYourWorkInstructions ?? '',
      scoringGuideWork: t.scoringGuideWork ?? '',
      scoringGuideAi: t.scoringGuideAi ?? '',
    });
  }, [view.data]);

  const save = trpc.tasks.reviewSaveEdits.useMutation({ onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); } });
  const approve = trpc.tasks.reviewApprove.useMutation({ onSuccess: (r) => setDone(r.title || 'the task') });

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
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };

  if (view.isLoading) return <Shell><div style={card}>Loading...</div></Shell>;
  if (view.error || !view.data) return <Shell><div style={card}><div style={{ display: 'flex', gap: 8, color: '#b91c1c' }}><AlertCircle size={18} /> This review link is invalid or has expired.</div></div></Shell>;

  const d = view.data as any;
  const task = d.task;

  if (done) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <CheckCircle2 size={22} color="#15803d" />
          <h2 style={{ margin: 0, fontSize: 18 }}>Work sample approved</h2>
        </div>
        <p style={{ color: '#5b6675', fontSize: 14, margin: 0 }}><strong>{done}</strong> is now Live and can be attached to roles.</p>
      </div></Shell>
    );
  }

  if (d.alreadyDecided) {
    return (
      <Shell><div style={card}>
        <div style={{ display: 'flex', gap: 8, color: '#6b7280' }}><AlertCircle size={18} /> This work sample has already been reviewed (current status: {task.status}).</div>
      </div></Shell>
    );
  }

  const field = (key: keyof typeof edits, label: string, rows = 3) => (
    <div>
      <label style={lbl}>{label}</label>
      {rows === 1
        ? <input style={inp} value={edits[key]} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} />
        : <textarea style={{ ...inp, minHeight: rows * 22 }} rows={rows} value={edits[key]} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} />}
    </div>
  );

  return (
    <Shell><div style={card}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Review &amp; approve: {task.title}</h2>
      <p style={{ color: '#5b6675', fontSize: 13, margin: '0 0 4px' }}>
        {task.departmentId ? 'Department task' : 'General task'} · {task.difficulty}{task.timeLimitMin ? ` · ${task.timeLimitMin} min` : ''} · Delivery: {task.deliveryMode === 'live_walkthrough' ? 'Live walkthrough' : 'Take-home'}
      </p>
      <p style={{ color: '#5b6675', fontSize: 13, margin: '8px 0 0' }}>
        Review and edit the task below, then approve. <strong>Until you approve, it stays a Draft and can't be attached to any role.</strong>
      </p>

      {field('title', 'Title', 1)}
      {field('brief', 'Brief (what the candidate sees)', 5)}
      {field('showYourWorkInstructions', 'Show-your-work instructions', 3)}
      {field('scoringGuideWork', 'Scoring guide — work quality', 3)}
      {field('scoringGuideAi', 'Scoring guide — AI skill', 3)}

      {approve.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '12px 0 0' }}>{approve.error.message}</p>}
      {save.error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '12px 0 0' }}>{save.error.message}</p>}

      <div style={{ marginTop: 20, borderTop: '1px solid #eef2f7', paddingTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 7, border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer', opacity: approve.isLoading ? 0.6 : 1 }}
          disabled={approve.isLoading}
          onClick={() => approve.mutate({ token })}
        >
          {approve.isLoading ? 'Approving...' : 'Approve & make Live'}
        </button>
        <button
          style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', opacity: save.isLoading ? 0.6 : 1 }}
          disabled={save.isLoading}
          onClick={() => save.mutate({ token, ...edits })}
        >
          {save.isLoading ? 'Saving...' : 'Save edits (keep as Draft)'}
        </button>
        {saved && <span style={{ color: '#15803d', fontSize: 13 }}>Saved.</span>}
      </div>
    </div></Shell>
  );
}
