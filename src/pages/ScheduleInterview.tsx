import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react';
import { trpc } from '../lib/trpc';

// Candidate-facing ALL-ROUNDS interview scheduling page (see interviewScheduling.ts /
// scheduling.getInterviewBookingContext + confirmInterviewBooking). One link lists
// every interview round; the candidate picks a time for each round from that
// round's interviewer's already-submitted availability (collected at intake), then
// confirms them all at once. Times land on each round in the Interviews tab.
export default function ScheduleInterview() {
  const { token = '' } = useParams();
  // roundId -> chosen slot label
  const [selections, setSelections] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = trpc.scheduling.getInterviewBookingContext.useQuery(
    { token },
    {
      enabled: !!token,
      retry: false,
      // Poll while any not-yet-booked round is still waiting on its interviewer's
      // availability, in case a window is submitted while this page is open.
      refetchInterval: (d: any) =>
        d && d.rounds?.some((r: any) => !r.alreadyBooked && r.slots.length === 0) ? 15000 : false,
    },
  );
  const confirm = trpc.scheduling.confirmInterviewBooking.useMutation({ onSuccess: () => refetch() });

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
  const schedulable = rounds.filter((r: any) => !r.alreadyBooked && r.slots.length > 0);
  const pending = rounds.filter((r: any) => !r.alreadyBooked && r.slots.length === 0);
  const allBooked = rounds.length > 0 && rounds.every((r: any) => r.alreadyBooked);
  const allChosen = schedulable.every((r: any) => selections[r.roundId]);

  // Everything the candidate can act on is booked → confirmation view.
  if (allBooked || (confirm.isSuccess && schedulable.length === 0)) {
    return (
      <Shell>
        <div className="text-center mb-4">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">You're all set{data.firstName ? `, ${data.firstName}` : ''}</h1>
          <p className="text-sm text-gray-500">Your interviews{data.jobTitle ? ` for ${data.jobTitle}` : ''} are confirmed. Calendar invites are on their way.</p>
        </div>
        <div className="space-y-2">
          {rounds.filter((r: any) => r.alreadyBooked).map((r: any) => (
            <div key={r.roundId} className="flex items-center justify-between px-4 py-3 rounded-md border border-gray-200 text-sm">
              <span className="font-medium text-gray-900">{r.roundName}{r.interviewerName ? ` · ${r.interviewerName}` : ''}</span>
              <span className="text-gray-600">{fmtWhen(r.scheduledAt)}</span>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Schedule your interviews{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        Hi {data.firstName}, pick a time for each round below. Choose times for all rounds, then confirm.
      </p>

      <div className="space-y-5 mb-4">
        {rounds.map((r: any) => (
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
            ) : r.slots.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500">
                <Clock className="text-ls-primary flex-shrink-0" size={16} />
                We're still confirming available times for this round. We'll email you when they're ready.
              </div>
            ) : (
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
            )}
          </div>
        ))}
      </div>

      {pending.length > 0 && schedulable.length > 0 && (
        <p className="text-xs text-gray-400 mb-2">
          You can confirm the rounds with times now — we'll email you to pick times for the rest once they're ready.
        </p>
      )}
      {confirm.error && <p className="text-xs text-red-600 mb-2">{confirm.error.message}</p>}

      <button
        onClick={() => {
          if (!allChosen || schedulable.length === 0) return;
          confirm.mutate({
            token,
            picks: schedulable.map((r: any) => ({ roundId: r.roundId, slot: selections[r.roundId] })),
          });
        }}
        disabled={confirm.isLoading || schedulable.length === 0 || !allChosen}
        className="w-full px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {confirm.isLoading
          ? 'Confirming…'
          : schedulable.length === 0
            ? 'Waiting for available times'
            : allChosen
              ? `Confirm ${schedulable.length > 1 ? `all ${schedulable.length} times` : 'this time'}`
              : 'Pick a time for each round'}
      </button>
    </Shell>
  );
}
