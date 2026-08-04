import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react';
import { trpc } from '../lib/trpc';

// Candidate-facing interview-round scheduling page (see interviewScheduling.ts /
// scheduling.getInterviewRoundBookingContext + confirmInterviewRoundSlot). Shows
// the assigned interviewer's already-submitted availability (collected at intake)
// as discrete slots to pick from — mirrors PhoneScreenConfirm's pattern, wired to
// the interview-round endpoints instead of the phone-screen ones.
export default function ScheduleInterview() {
  const { token = '' } = useParams();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = trpc.scheduling.getInterviewRoundBookingContext.useQuery(
    { token },
    {
      enabled: !!token,
      retry: false,
      // Poll while no slots are offered yet, in case the interviewer submits
      // availability while the candidate has this page open.
      refetchInterval: (d: any) => (d && !d.alreadyBooked && d.slots.length === 0 ? 15000 : false),
    },
  );
  const confirm = trpc.scheduling.confirmInterviewRoundSlot.useMutation({ onSuccess: () => refetch() });

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

  if (data.alreadyBooked || confirm.isSuccess) {
    const when = data.scheduledAt ? new Date(data.scheduledAt).toLocaleString() : selected;
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">You're all set{data.firstName ? `, ${data.firstName}` : ''}</h1>
          <p className="text-sm text-gray-500">
            Your {data.roundName || 'interview'}{data.jobTitle ? ` for ${data.jobTitle}` : ''} is confirmed{when ? ` for ${when}` : ''}.
            {data.interviewerName ? ` You'll be meeting with ${data.interviewerName}.` : ''} A calendar invite is on its way by email.
          </p>
        </div>
      </Shell>
    );
  }

  if (!data.slots.length) {
    return (
      <Shell>
        <div className="text-center">
          <Clock className="mx-auto mb-3 text-ls-primary" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Finalizing times</h1>
          <p className="text-sm text-gray-500">
            We're still confirming available times with your interviewer for your {data.roundName || 'interview'}{data.jobTitle ? ` for ${data.jobTitle}` : ''}. We'll email you as soon as times are ready to pick from.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Schedule your {data.roundName || 'interview'}{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        Hi {data.firstName}, choose the time below that works best for you{data.interviewerName ? ` with ${data.interviewerName}` : ''}.
      </p>

      <div className="space-y-2 mb-4">
        {data.slots.map((slot: string, i: number) => {
          const active = selected === slot;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(slot)}
              className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-md border text-sm transition-colors ${active ? 'border-ls-primary bg-ls-primary/5 ring-1 ring-ls-primary' : 'border-gray-200 hover:border-gray-400'}`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${active ? 'border-ls-primary' : 'border-gray-300'}`}>
                {active && <span className="w-2 h-2 rounded-full bg-ls-primary" />}
              </span>
              <span className={active ? 'font-medium text-gray-900' : 'text-gray-700'}>{slot}</span>
            </button>
          );
        })}
      </div>

      {confirm.error && <p className="text-xs text-red-600 mb-2">{confirm.error.message}</p>}
      <button
        onClick={() => selected && confirm.mutate({ token, slot: selected })}
        disabled={confirm.isLoading || !selected}
        className="w-full px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {confirm.isLoading ? 'Confirming…' : selected ? 'Confirm this time' : 'Select a time above'}
      </button>
    </Shell>
  );
}
