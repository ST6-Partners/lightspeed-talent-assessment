import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Calendar, Clock, Send } from 'lucide-react';
import { trpc } from '../lib/trpc';

// Candidate-facing ALL-ROUNDS interview scheduling page. One link lists every
// round; the candidate picks a time per round from that round's interviewer's
// submitted availability (getInterviewBookingContext + confirmInterviewBooking).
// If none of a round's offered times work, the candidate proposes their own 3+
// times for that round (proposeInterviewRoundSlots) — mirroring the phone-screen
// counter-proposal flow — and the round's interviewer picks one or reaches out.
type Row = { date: string; start: string; end: string };
const emptyRows = (): Row[] => [
  { date: '', start: '', end: '' },
  { date: '', start: '', end: '' },
  { date: '', start: '', end: '' },
];

export default function ScheduleInterview() {
  const { token = '' } = useParams();
  const [selections, setSelections] = useState<Record<string, string>>({});
  // roundId -> proposal rows (presence means the propose form is open for that round)
  const [proposeRows, setProposeRows] = useState<Record<string, Row[]>>({});

  const { data, isLoading, error, refetch } = trpc.scheduling.getInterviewBookingContext.useQuery(
    { token },
    {
      enabled: !!token,
      retry: false,
      refetchInterval: (d: any) =>
        d && d.rounds?.some((r: any) => !r.alreadyBooked && !r.proposed && r.slots.length === 0) ? 15000 : false,
    },
  );
  const confirm = trpc.scheduling.confirmInterviewBooking.useMutation({ onSuccess: () => refetch() });
  const propose = trpc.scheduling.proposeInterviewRoundSlots.useMutation({
    onSuccess: () => { setProposeRows({}); refetch(); },
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
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

  const fmtWhen = (v: string | null) => (v ? new Date(v).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  if (isLoading) return <Shell><p className="text-sm text-gray-400 text-center">Loading…</p></Shell>;

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Link not found</h1>
          <p className="text-sm text-gray-500">This scheduling link is invalid or has expired. Please contact the hiring team.</p>
        </div>
      </Shell>
    );
  }

  const rounds = data.rounds ?? [];
  // Role week-window the interviewers offered from — bound the "suggest other
  // times" date picker to it (and guide toward it) so counter-proposals stay in
  // the same span and every round clusters together. Undefined = unbounded.
  const winStart = (data as any).windowStart ? (data as any).windowStart.slice(0, 10) : undefined;
  const winEnd = (data as any).windowEnd ? (data as any).windowEnd.slice(0, 10) : undefined;
  const fmtWin = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
  const schedulable = rounds.filter((r: any) => !r.alreadyBooked && !r.proposed && r.slots.length > 0);
  const allChosen = schedulable.every((r: any) => selections[r.roundId]);
  const nothingLeftToDo = rounds.length > 0 && rounds.every((r: any) => r.alreadyBooked || r.proposed);

  if (nothingLeftToDo && !schedulable.length) {
    return (
      <Shell>
        <div className="text-center mb-4">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">You're all set{data.firstName ? `, ${data.firstName}` : ''}</h1>
          <p className="text-sm text-gray-500">Here's where your interviews{data.jobTitle ? ` for ${data.jobTitle}` : ''} stand. Calendar invites go out as each round is confirmed.</p>
        </div>
        <div className="space-y-2">
          {rounds.map((r: any) => (
            <div key={r.roundId} className="flex items-center justify-between px-4 py-3 rounded-md border border-gray-200 text-sm">
              <span className="font-medium text-gray-900">{r.roundName}{r.interviewerName ? ` · ${r.interviewerName}` : ''}</span>
              <span className="text-gray-600">{r.alreadyBooked ? fmtWhen(r.scheduledAt) : 'Times sent — awaiting interviewer'}</span>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  const setRow = (roundId: string, i: number, patch: Partial<Row>) =>
    setProposeRows((s) => ({ ...s, [roundId]: s[roundId].map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const addRow = (roundId: string) =>
    setProposeRows((s) => ({ ...s, [roundId]: [...s[roundId], { date: '', start: '', end: '' }] }));
  const filledRows = (roundId: string) => (proposeRows[roundId] ?? []).filter((r) => r.date && r.start && r.end);

  return (
    <Shell>
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Schedule your interviews{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        Hi {data.firstName}, pick a time for each round below. If none of the offered times work for a round, you can suggest your own.
      </p>

      {data.converged === false && rounds.filter((r: any) => !r.alreadyBooked && !r.proposed).length > 1 && (
        <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
          We couldn't line up a set of times that keeps every round close together. Pick your best options below, and use "suggest your own times" for any round that doesn't fit — the hiring team will coordinate the rest.
        </div>
      )}

      <div className="space-y-5 mb-4">
        {rounds.map((r: any) => {
          const proposing = !!proposeRows[r.roundId];
          return (
            <div key={r.roundId}>
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-semibold text-sm text-gray-900">{r.roundName}</span>
                {r.interviewerName && <span className="text-xs text-gray-500">with {r.interviewerName}</span>}
              </div>

              {r.alreadyBooked ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-green-200 bg-green-50 text-sm text-gray-700">
                  <CheckCircle2 className="text-green-600 flex-shrink-0" size={16} />
                  Confirmed for {fmtWhen(r.scheduledAt)}
                </div>
              ) : r.proposed ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-blue-200 bg-blue-50 text-sm text-gray-700">
                  <Send className="text-ls-primary flex-shrink-0" size={16} />
                  Your suggested times were sent to {r.interviewerName || 'your interviewer'}. They'll confirm one or reach out to you directly.
                </div>
              ) : proposing ? (
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Suggest at least 3 times that work for you{winStart ? <> between <strong>{fmtWin(winStart)}</strong> and <strong>{fmtWin(winEnd)}</strong>, so all your rounds stay close together</> : null}.
                  </p>
                  <div className="space-y-2">
                    {proposeRows[r.roundId].map((row, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="date" value={row.date} min={winStart} max={winEnd} onChange={(e) => setRow(r.roundId, i, { date: e.target.value })} className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <input type="time" value={row.start} onChange={(e) => setRow(r.roundId, i, { start: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <span className="text-gray-400 text-xs">to</span>
                        <input type="time" value={row.end} onChange={(e) => setRow(r.roundId, i, { end: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => addRow(r.roundId)} className="text-xs text-ls-primary hover:underline mt-2">+ Add another time</button>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => filledRows(r.roundId).length >= 3 && propose.mutate({ token, roundId: r.roundId, windows: filledRows(r.roundId) })}
                      disabled={propose.isLoading || filledRows(r.roundId).length < 3}
                      className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
                    >
                      {propose.isLoading ? 'Sending…' : filledRows(r.roundId).length < 3 ? `Add ${3 - filledRows(r.roundId).length} more` : 'Send my times'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProposeRows((s) => { const n = { ...s }; delete n[r.roundId]; return n; })}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {r.slots.length > 0 ? (
                    <div className="space-y-2">
                      {r.slots.map((slot: string, i: number) => {
                        const active = selections[r.roundId] === slot;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelections((s) => ({ ...s, [r.roundId]: slot }))}
                            className={`w-full flex items-center gap-3 text-left px-4 py-2.5 rounded-md border text-sm transition-colors ${active ? 'border-ls-primary bg-ls-primary/5 ring-1 ring-ls-primary' : 'border-gray-200 hover:border-gray-400'}`}
                          >
                            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${active ? 'border-ls-primary' : 'border-gray-300'}`}>
                              {active && <span className="w-2 h-2 rounded-full bg-ls-primary" />}
                            </span>
                            <span className={active ? 'font-medium text-gray-900' : 'text-gray-700'}>{slot}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500">
                      <Clock className="text-ls-primary flex-shrink-0" size={16} />
                      No times offered yet for this round.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setProposeRows((s) => ({ ...s, [r.roundId]: emptyRows() }))}
                    className="text-xs text-ls-primary hover:underline mt-2"
                  >
                    None of these work — suggest other times
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {propose.error && <p className="text-xs text-red-600 mb-2">{propose.error.message}</p>}
      {confirm.error && <p className="text-xs text-red-600 mb-2">{confirm.error.message}</p>}

      {schedulable.length > 0 && (
        <button
          onClick={() => {
            if (!allChosen) return;
            confirm.mutate({ token, picks: schedulable.map((r: any) => ({ roundId: r.roundId, slot: selections[r.roundId] })) });
          }}
          disabled={confirm.isLoading || !allChosen}
          className="w-full px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {confirm.isLoading
            ? 'Confirming…'
            : allChosen
              ? `Confirm ${schedulable.length > 1 ? `all ${schedulable.length} times` : 'this time'}`
              : 'Pick a time for each round'}
        </button>
      )}
    </Shell>
  );
}
