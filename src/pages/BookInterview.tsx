import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function BookInterview() {
  const { token = '' } = useParams();

  const { data, isLoading, error } = trpc.scheduling.getBookingContext.useQuery(
    { token },
    {
      enabled: !!token,
      retry: false,
      // Poll while unbooked so the page flips to "confirmed" once the Calendly
      // webhook records the booking server-side.
      refetchInterval: (d: any) => (d && !d.alreadyBooked ? 15000 : false),
    },
  );

  // Load the Calendly inline-widget script once.
  useEffect(() => {
    if (!data?.calendlyUrl || data.alreadyBooked) return;
    const existing = document.querySelector('script[src="https://assets.calendly.com/assets/external/widget.js"]');
    if (existing) return;
    const s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    document.body.appendChild(s);
  }, [data?.calendlyUrl, data?.alreadyBooked]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ls-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
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
          <p className="text-sm text-gray-500">This booking link is invalid or has expired. Please contact the hiring team.</p>
        </div>
      </Shell>
    );
  }

  if (data.alreadyBooked) {
    const when = data.scheduledAt ? new Date(data.scheduledAt).toLocaleString() : null;
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Interview confirmed</h1>
          <p className="text-sm text-gray-500">
            Thanks{data.firstName ? `, ${data.firstName}` : ''} — your interview{data.jobTitle ? ` for ${data.jobTitle}` : ''} is booked{when ? ` for ${when}` : ''}. A calendar invite is on its way by email.
          </p>
          {data.joinUrl ? (
            <a href={data.joinUrl} className="inline-block mt-4 text-sm text-ls-primary font-medium underline">Join link</a>
          ) : null}
        </div>
      </Shell>
    );
  }

  if (!data.calendlyUrl) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Calendar className="mx-auto mb-3 text-gray-400" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Scheduling not ready yet</h1>
          <p className="text-sm text-gray-500">The interview scheduling link isn't set up yet. We'll email you as soon as it's ready.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Book your interview{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Hi {data.firstName}, pick the time that works best for you below. You'll get a calendar invite with the meeting link once you book.
        </p>
        {/* Calendly inline widget — initialized by the loaded widget.js */}
        <div
          className="calendly-inline-widget mt-4"
          data-url={data.calendlyUrl}
          style={{ minWidth: '320px', height: '700px' }}
        />
      </div>
    </Shell>
  );
}
