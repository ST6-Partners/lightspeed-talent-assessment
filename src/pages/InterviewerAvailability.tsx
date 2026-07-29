import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';

// Public self-serve page for the "Set my availability" link in the intake-approval
// email (no login). The interviewer adds the dates/times they're free; on submit
// it's stored and a summary is dropped into the hiring-team inbox. Mirrors the
// internal-candidate express-interest flow.
type Win = { date: string; start: string; end: string };
const EMPTY_ROW: Win = { date: '', start: '', end: '' };

export default function InterviewerAvailability() {
  const { token = '' } = useParams();
  const [rows, setRows] = useState<Win[]>([{ ...EMPTY_ROW }]);
  const [note, setNote] = useState('');

  const ctx = trpc.scheduling.getInterviewerAvailabilityContext.useQuery({ token }, { enabled: !!token, retry: false });
  const submit = trpc.scheduling.submitInterviewerAvailability.useMutation();

  // Prefill from a prior submission, if any.
  useEffect(() => {
    const w = ctx.data?.windows as Win[] | null | undefined;
    if (w && w.length) setRows(w.map((x) => ({ date: x.date ?? '', start: x.start ?? '', end: x.end ?? '' })));
    if (ctx.data?.note) setNote(ctx.data.note);
  }, [ctx.data]);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ls-bg flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-ls-line shadow-sm p-7">{children}</div>
    </div>
  );

  if (!token || ctx.error || (!ctx.isLoading && !ctx.data)) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Link not valid</h1>
        <p className="text-sm text-ls-ink-2">This link is invalid or has expired. If you need to share your interview availability, contact the hiring team directly.</p>
      </Card>
    );
  }
  if (ctx.isLoading) return <Card><p className="text-sm text-ls-ink-3">Loading…</p></Card>;

  if (submit.isSuccess) {
    return (
      <Card>
        <div className="text-3xl mb-2">✓</div>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Availability received</h1>
        <p className="text-sm text-ls-ink-2">Thanks — the hiring team has your availability for <strong>{ctx.data!.role}</strong> and will schedule inside the target window. You can close this page, or resubmit from the same link if your availability changes.</p>
      </Card>
    );
  }

  const setRow = (i: number, patch: Partial<Win>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const filled = rows.filter((r) => r.date && r.start && r.end);
  const canSubmit = filled.length > 0 && !submit.isLoading;

  return (
    <Card>
      <h1 className="text-lg font-bold text-ls-ink mb-1">Set your interview availability</h1>
      <p className="text-sm text-ls-ink-2 mb-4">You’re on the interview team for <strong>{ctx.data!.role}</strong>. Add the dates and times you’re free and submit — no login needed.</p>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="date" value={r.date} onChange={(e) => setRow(i, { date: e.target.value })}
              className="flex-1 px-2 py-2 border border-ls-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <input type="time" value={r.start} onChange={(e) => setRow(i, { start: e.target.value })}
              className="px-2 py-2 border border-ls-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <span className="text-ls-ink-3 text-sm">to</span>
            <input type="time" value={r.end} onChange={(e) => setRow(i, { end: e.target.value })}
              className="px-2 py-2 border border-ls-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}
              className="text-ls-ink-3 hover:text-red-600 text-lg leading-none px-1 disabled:opacity-30" title="Remove">×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-2 text-sm font-medium text-ls-primary hover:underline">+ Add another time</button>

      <label className="block text-xs font-medium text-ls-ink-2 mt-4 mb-1">Note (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="e.g. prefer mornings, avoid the 14th"
        className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan" />

      {submit.error && <p className="text-sm text-red-600 mb-2">{submit.error.message}</p>}
      <button
        onClick={() => submit.mutate({ token, windows: filled, note: note.trim() || undefined })}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-lg bg-ls-primary text-white font-semibold text-sm hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {submit.isLoading ? 'Submitting…' : 'Submit availability'}
      </button>
    </Card>
  );
}
