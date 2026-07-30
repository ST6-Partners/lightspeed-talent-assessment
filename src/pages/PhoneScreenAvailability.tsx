import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, CalendarClock } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function PhoneScreenAvailability() {
  const { token = '' } = useParams();
  const [availability, setAvailability] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error, refetch } = trpc.scheduling.phoneScreenSchedulingContext.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const submit = trpc.scheduling.submitPhoneScreenAvailability.useMutation({
    onSuccess: () => { setDone(true); refetch(); },
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ls-bg flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
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
        {children}
      </div>
    </div>
  );

  if (isLoading) {
    return <Shell><div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">Loading…</div></Shell>;
  }
  if (error || !data) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Link not found</h1>
          <p className="text-sm text-gray-500">This availability link is invalid or has expired.</p>
        </div>
      </Shell>
    );
  }

  const alreadySubmitted = done || data.submitted;

  if (alreadySubmitted) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Availability sent to the candidate</h1>
          <p className="text-sm text-gray-500">
            {data.candidateName}{data.jobTitle ? ` (${data.jobTitle})` : ''} has been emailed your availability to confirm a time.
            {data.candidateBooked ? ' They have already confirmed a time.' : ' You’ll be notified when they pick a time, or if none of them work.'}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <CalendarClock className="mb-3 text-ls-primary" size={26} />
        <h1 className="text-xl font-bold text-gray-900">Set your availability for a phone screen</h1>
        <p className="text-gray-500 text-sm mt-1 mb-4">
          <strong>{data.candidateName}</strong>{data.jobTitle ? ` — ${data.jobTitle}` : ''} is ready for a phone screen. List a few windows that work for you.
          The candidate is emailed these times to confirm — they are not contacted until you submit.
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Your availability</label>
        <textarea
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          rows={5}
          placeholder={'e.g.\nTue Aug 4, 2:00–4:00pm ET\nWed Aug 5, 10:00am–12:00pm ET\nThu Aug 6, after 1:00pm ET'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
        />
        {submit.error && <p className="text-xs text-red-600 mt-2">{submit.error.message}</p>}
        <button
          onClick={() => submit.mutate({ token, availability: availability.trim() })}
          disabled={!availability.trim() || submit.isLoading}
          className="mt-3 px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
        >
          {submit.isLoading ? 'Sending…' : 'Send availability to candidate'}
        </button>
      </div>
    </Shell>
  );
}
