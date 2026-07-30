import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react';
import { trpc } from '../lib/trpc';

type Win = { date: string; start: string; end: string };
const EMPTY_ROW: Win = { date: '', start: '', end: '' };

// Card defined at module scope (not inside the component) so its identity is stable
// across renders — otherwise the date/time inputs remount on each keystroke and lose focus.
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-ls-bg flex items-center justify-center p-4">
    <div className="w-full max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <svg width="30" height="30" viewBox="0 0 40 40" fill="none" stroke="#4FA9D6" strokeWidth="3.6" strokeLinecap="round">
          <path d="M11 8 a8.5 8.5 0 0 1 8.5 8.5 v7 a8.5 8.5 0 0 0 8.5 8.5" />
          <path d="M29 8 a8.5 8.5 0 0 0 -8.5 8.5 v7 a8.5 8.5 0 0 1 -8.5 8.5" />
          <line x1="5" y1="14" x2="11.5" y2="14" />
          <line x1="28.5" y1="26" x2="35" y2="26" />
        </svg>
        <div className="leading-tight">
          <div className="font-bold text-[15px] text-gray-900">Lightspeed</div>
          <div className="text-[11px] text-gray-500">Talent Assessment</div>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6">{children}</div>
    </div>
  </div>
);

export default function PhoneScreenAvailability() {
  const { token = '' } = useParams();
  const [rows, setRows] = useState<Win[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error, refetch } = trpc.scheduling.phoneScreenSchedulingContext.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );
  const submit = trpc.scheduling.submitPhoneScreenAvailability.useMutation({
    onSuccess: () => { setDone(true); refetch(); },
  });
  const [pickSelected, setPickSelected] = useState<string | null>(null);
  const pick = trpc.scheduling.confirmCandidateSlot.useMutation({ onSuccess: () => refetch() });

  if (isLoading) return <Card><p className="text-sm text-gray-400">Loading…</p></Card>;
  if (error || !data) {
    return (
      <Card>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Link not found</h1>
          <p className="text-sm text-gray-500">This availability link is invalid or has expired.</p>
        </div>
      </Card>
    );
  }

  if ((data as any).candidateBooked) {
    return (
      <Card>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Phone screen confirmed</h1>
          <p className="text-sm text-gray-500">
            {data.candidateName}{data.jobTitle ? ` (${data.jobTitle})` : ''} is booked{(data as any).selectedSlot ? ` for ${(data as any).selectedSlot}` : ''}.
          </p>
        </div>
      </Card>
    );
  }

  const candidateSlots: string[] = Array.isArray((data as any).candidateSlots) ? (data as any).candidateSlots : [];
  if (candidateSlots.length > 0) {
    return (
      <Card>
        <CalendarClock className="mb-3 text-ls-primary" size={26} />
        <h1 className="text-xl font-bold text-gray-900">The candidate proposed new times</h1>
        <p className="text-gray-500 text-sm mt-1 mb-4">
          <strong>{data.candidateName}</strong>{data.jobTitle ? ` — ${data.jobTitle}` : ''} couldn't make your windows and sent the times below. Pick one to confirm the phone screen — they'll be emailed the final time.
        </p>
        <div className="space-y-2 mb-4">
          {candidateSlots.map((slot, i) => {
            const active = pickSelected === slot;
            return (
              <button key={i} type="button" onClick={() => setPickSelected(slot)}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-md border text-sm transition-colors ${active ? 'border-ls-primary bg-ls-primary/5 ring-1 ring-ls-primary' : 'border-gray-200 hover:border-gray-400'}`}>
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${active ? 'border-ls-primary' : 'border-gray-300'}`}>
                  {active && <span className="w-2 h-2 rounded-full bg-ls-primary" />}
                </span>
                <span className={active ? 'font-medium text-gray-900' : 'text-gray-700'}>{slot}</span>
              </button>
            );
          })}
        </div>
        {pick.error && <p className="text-sm text-red-600 mb-2">{pick.error.message}</p>}
        <button onClick={() => pickSelected && pick.mutate({ token, slot: pickSelected })}
          disabled={!pickSelected || pick.isLoading}
          className="w-full py-2.5 rounded-lg bg-ls-primary text-white font-semibold text-sm hover:bg-ls-primary-600 disabled:opacity-50">
          {pick.isLoading ? 'Confirming…' : pickSelected ? 'Confirm this time' : 'Select a time above'}
        </button>
      </Card>
    );
  }

  if (done || data.submitted) {
    return (
      <Card>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Availability sent to the candidate</h1>
          <p className="text-sm text-gray-500">
            {data.candidateName}{data.jobTitle ? ` (${data.jobTitle})` : ''} has been emailed your availability to confirm a time.
            {data.candidateBooked ? ' They have already confirmed a time.' : ' You’ll be notified when they pick a time, or if none of them work.'}
          </p>
        </div>
      </Card>
    );
  }

  const setRow = (i: number, patch: Partial<Win>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  const removeRow = (i: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const filled = rows.filter((r) => r.date && r.start && r.end);
  const canSubmit = filled.length > 0 && !submit.isLoading;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CalendarClock className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Set your availability for a phone screen</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        <strong>{data.candidateName}</strong>{data.jobTitle ? ` — ${data.jobTitle}` : ''} is ready for a phone screen. Please add <strong>at least 3 open times</strong> so the candidate has options.
        They’re emailed these windows to pick one — and are not contacted until you submit.
      </p>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="date" value={r.date} min={todayStr} onChange={(e) => setRow(i, { date: e.target.value })}
              className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <input type="time" value={r.start} onChange={(e) => setRow(i, { start: e.target.value })}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="time" value={r.end} onChange={(e) => setRow(i, { end: e.target.value })}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
            <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1}
              className="text-gray-400 hover:text-red-600 text-lg leading-none px-1 disabled:opacity-30" title="Remove">×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-2 text-sm font-medium text-ls-primary hover:underline">+ Add another time</button>

      <label className="block text-xs font-medium text-gray-600 mt-4 mb-1">Note (optional)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="e.g. prefer mornings; I'll call the number on file"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan" />

      {filled.length > 0 && filled.length < 3 && <p className="text-xs text-amber-600 mb-2">Please add at least 3 open times so the candidate has options ({filled.length} added).</p>}
      {submit.error && <p className="text-sm text-red-600 mb-2">{submit.error.message}</p>}
      <button
        onClick={() => submit.mutate({ token, windows: filled, note: note.trim() || undefined })}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-lg bg-ls-primary text-white font-semibold text-sm hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {submit.isLoading ? 'Sending…' : 'Send availability to candidate'}
      </button>
    </Card>
  );
}
