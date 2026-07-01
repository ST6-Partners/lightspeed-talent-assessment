import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

export default function WorkSample() {
  const { token = '' } = useParams();
  const [submission, setSubmission] = useState('');
  const [link, setLink] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = trpc.workSample.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const submitMutation = trpc.workSample.submit.useMutation({
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
          <p className="text-sm text-gray-500">This work-sample link is invalid or has expired. Please contact the hiring team.</p>
        </div>
      </Shell>
    );
  }

  if (done || data.alreadySubmitted) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Submission received</h1>
          <p className="text-sm text-gray-500">
            Thanks{data.firstName ? `, ${data.firstName}` : ''} — your work sample{data.jobTitle ? ` for ${data.jobTitle}` : ''} has been submitted. The hiring team will be in touch with next steps.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Work Sample{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Hi {data.firstName}, please complete the task below and submit your response. There's no time pressure beyond the deadline in your email.
        </p>

        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Instructions</div>
          {data.taskTitle && <div className="text-sm font-semibold text-gray-900 mb-2">{data.taskTitle}</div>}
          <div className="text-sm text-gray-700 whitespace-pre-line">
            {data.instructions || 'Instructions will be provided by the hiring team.'}
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">Your response *</label>
          <textarea
            value={submission}
            onChange={(e) => setSubmission(e.target.value)}
            rows={10}
            placeholder="Write your response here…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Link <span className="text-gray-400 font-normal">(optional — e.g. a doc, repo, or video)</span>
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
          />
        </div>

        {submitMutation.error && (
          <p className="mt-3 text-sm text-red-600">{submitMutation.error.message}</p>
        )}

        <div className="mt-5">
          <button
            onClick={() => submitMutation.mutate({ token, submission, link: link || undefined })}
            disabled={!submission.trim() || submitMutation.isLoading}
            className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {submitMutation.isLoading ? 'Submitting…' : 'Submit work sample'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
