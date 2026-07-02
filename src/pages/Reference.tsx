import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function Reference() {
  const { token = '' } = useParams();
  const [response, setResponse] = useState('');
  const [wouldRehire, setWouldRehire] = useState<'yes' | 'no' | 'unsure' | ''>('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = trpc.references.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const submitMutation = trpc.references.submitResponse.useMutation({
    onSuccess: () => setDone(true),
  });

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
          <p className="text-sm text-gray-500">This reference link is invalid or has expired. Please contact the hiring team.</p>
        </div>
      </Shell>
    );
  }

  if (done || data.alreadyResponded) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Thank you</h1>
          <p className="text-sm text-gray-500">
            Your reference for {data.candidateName} has been submitted. We appreciate your time.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Reference for {data.candidateName}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Hi {data.referenceName}, {data.candidateName} listed you as a reference
          {data.jobTitle ? ` for the ${data.jobTitle} role` : ''} at Lightspeed Systems. A few sentences is plenty.
        </p>

        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            In your experience, how would you describe working with {data.candidateName}? Strengths, and anything we should be aware of. *
          </label>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={9}
            placeholder="Write your reference here…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Would you work with them again?</label>
          <div className="flex gap-2">
            {(['yes', 'unsure', 'no'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setWouldRehire(v)}
                className={`px-3 py-1.5 rounded-md text-sm border ${wouldRehire === v ? 'bg-ls-primary text-white border-ls-primary' : 'border-gray-300 text-gray-700'}`}
              >
                {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Unsure'}
              </button>
            ))}
          </div>
        </div>

        {submitMutation.error && (
          <p className="mt-3 text-sm text-red-600">{submitMutation.error.message}</p>
        )}

        <div className="mt-5">
          <button
            onClick={() => submitMutation.mutate({ token, response, wouldRehire: wouldRehire || undefined })}
            disabled={!response.trim() || submitMutation.isLoading}
            className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {submitMutation.isLoading ? 'Submitting…' : 'Submit reference'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
