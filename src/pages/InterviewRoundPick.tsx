import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Calendar, Mail } from 'lucide-react';
import { trpc } from '../lib/trpc';

// Interviewer-facing page: the candidate couldn't make any of the interviewer's
// offered times and proposed their own for this round. The interviewer picks one
// (books it) or reaches out directly. Mirrors the recruiter side of the
// phone-screen counter-proposal flow (PhoneScreenAvailability's candidate-slots
// branch), wired to the interview-round proposal endpoints.
function Shell({ children }: { children: React.ReactNode }) {
  return (
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
}

export default function InterviewRoundPick() {
  const { token = '' } = useParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [reachedOut, setReachedOut] = useState<{ email: string } | null>(null);

  const { data, isLoading, error, refetch } = trpc.scheduling.getInterviewRoundProposalContext.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );
  const confirm = trpc.scheduling.confirmInterviewRoundProposedSlot.useMutation({ onSuccess: () => refetch() });
  const reachOut = trpc.scheduling.interviewerReachOutInterviewRound.useMutation({
    onSuccess: (res: any) => setReachedOut({ email: res?.email ?? data?.candidateEmail ?? '' }),
  });


  const fmtWhen = (v: string | Date | null) => (v ? new Date(v).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

  if (isLoading) return <Shell><p className="text-sm text-gray-400 text-center">Loading…</p></Shell>;

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Link not found</h1>
          <p className="text-sm text-gray-500">This link is invalid or has expired.</p>
        </div>
      </Shell>
    );
  }

  if (data.alreadyBooked || confirm.isSuccess) {
    const when = data.scheduledAt ? fmtWhen(data.scheduledAt) : selected;
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Interview confirmed</h1>
          <p className="text-sm text-gray-500">
            {data.candidateName}'s {data.roundName}{data.jobTitle ? ` for ${data.jobTitle}` : ''} is scheduled{when ? ` for ${when}` : ''}. We've let them know.
          </p>
        </div>
      </Shell>
    );
  }

  if (reachedOut) {
    const subject = encodeURIComponent(`Scheduling your ${data.roundName}${data.jobTitle ? ` — ${data.jobTitle}` : ''}`);
    return (
      <Shell>
        <div className="text-center mb-4">
          <Mail className="mx-auto mb-3 text-ls-primary" size={26} />
          <h1 className="font-semibold text-gray-900 mb-1">Reach out directly</h1>
          <p className="text-sm text-gray-500">We've let {data.candidateName} know you'll contact them. Email them to find a time that works.</p>
        </div>
        <a
          href={`mailto:${reachedOut.email}?subject=${subject}`}
          className="w-full inline-block text-center px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600"
        >
          Email {reachedOut.email}
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <Calendar className="mb-3 text-ls-primary" size={26} />
      <h1 className="text-xl font-bold text-gray-900">Pick a time for {data.candidateName}</h1>
      <p className="text-gray-500 text-sm mt-1 mb-4">
        {data.candidateName} couldn't make the times offered for their <strong>{data.roundName}</strong>{data.jobTitle ? ` (${data.jobTitle})` : ''} and proposed these instead. Pick one to confirm, or reach out directly.
      </p>

      {data.proposedSlots.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No proposed times were found.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {data.proposedSlots.map((slot: string, i: number) => {
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
      )}

      {confirm.error && <p className="text-xs text-red-600 mb-2">{confirm.error.message}</p>}
      <button
        onClick={() => selected && confirm.mutate({ token, slot: selected })}
        disabled={confirm.isLoading || !selected}
        className="w-full px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50 mb-2"
      >
        {confirm.isLoading ? 'Confirming…' : selected ? 'Confirm this time' : 'Select a time above'}
      </button>
      <button
        onClick={() => reachOut.mutate({ token })}
        disabled={reachOut.isLoading}
        className="w-full px-5 py-2.5 bg-white text-gray-600 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {reachOut.isLoading ? 'One moment…' : 'None of these work — I’ll reach out directly'}
      </button>
    </Shell>
  );
}
