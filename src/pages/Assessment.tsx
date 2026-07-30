import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

// Placeholder assessment (used while there's no live Criteria/CCAT key). The
// candidate opens the emailed link, answers one work-sample question, and
// submits — capturing a real response instead of randomly-simulated scores.
export default function Assessment() {
  const { token = '' } = useParams();
  const [submission, setSubmission] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = trpc.candidates.assessmentGetByToken.useQuery(
    { token },
    { enabled: !!token, retry: false },
  );

  const submitMutation = trpc.candidates.assessmentSubmit.useMutation({
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
          <p className="text-sm text-gray-500">This assessment link is invalid or has expired. Please contact the hiring team.</p>
        </div>
      </Shell>
    );
  }

  if (done || data.alreadySubmitted) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Assessment submitted</h1>
          <p className="text-sm text-gray-500">
            Thanks{data.firstName ? `, ${data.firstName}` : ''} — your assessment{data.jobTitle ? ` for ${data.jobTitle}` : ''} has been submitted. The hiring team will be in touch with next steps.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Assessment{data.jobTitle ? ` — ${data.jobTitle}` : ''}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Hi {data.firstName}, please answer the question below and submit. There's no time pressure beyond the deadline in your email.
        </p>

        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Question</div>
          {data.taskTitle && <div className="text-sm font-semibold text-gray-900 mb-2">{data.taskTitle}</div>}
          <div className="text-sm text-gray-700 whitespace-pre-line">
            {data.instructions || 'The hiring team will share the assessment details.'}
          </div>
        </div>

        {(data as any).answerFormat === 'multi_select' ? (
          <>
            <div className="mt-5">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Choose {(data as any).selectCount}
                {typeof (data as any).selectCount === 'number' && (
                  <span className="text-gray-400 font-normal"> ({selected.length}/{(data as any).selectCount} selected)</span>
                )}
              </label>
              <div className="space-y-2">
                {(((data as any).options as string[] | null) ?? []).map((opt) => {
                  const checked = selected.includes(opt);
                  const limit = (data as any).selectCount as number | null;
                  const atLimit = typeof limit === 'number' && selected.length >= limit;
                  return (
                    <label
                      key={opt}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer ${checked ? 'border-ls-cyan bg-cyan-50' : 'border-gray-300'} ${!checked && atLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && atLimit}
                        onChange={() =>
                          setSelected((prev) => (checked ? prev.filter((x) => x !== opt) : [...prev, opt]))
                        }
                        className="accent-ls-cyan"
                      />
                      <span className="text-gray-800">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {submitMutation.error && (
              <p className="mt-3 text-sm text-red-600">{submitMutation.error.message}</p>
            )}

            <div className="mt-5">
              <button
                onClick={() => submitMutation.mutate({ token, submission: selected.join(', '), selections: selected })}
                disabled={selected.length !== (data as any).selectCount || submitMutation.isLoading}
                className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
              >
                {submitMutation.isLoading ? 'Submitting…' : 'Submit assessment'}
              </button>
            </div>
          </>
        ) : (
          <>
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

            {submitMutation.error && (
              <p className="mt-3 text-sm text-red-600">{submitMutation.error.message}</p>
            )}

            <div className="mt-5">
              <button
                onClick={() => submitMutation.mutate({ token, submission })}
                disabled={!submission.trim() || submitMutation.isLoading}
                className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
              >
                {submitMutation.isLoading ? 'Submitting…' : 'Submit assessment'}
              </button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
