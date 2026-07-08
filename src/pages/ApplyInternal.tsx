import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

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
          <div className="text-[11px] text-gray-500">Internal Opening</div>
        </div>
      </div>
      {children}
    </div>
  </div>
);

export default function ApplyInternal() {
  const { jdId = '' } = useParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [done, setDone] = useState(false);

  const { data, isLoading, error } = trpc.internalOpenings.getRoleForInternal.useQuery(
    { jdId },
    { enabled: !!jdId, retry: false },
  );
  const apply = trpc.internalOpenings.applyInternal.useMutation({ onSuccess: () => setDone(true) });


  if (isLoading) return <Shell><div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">Loading…</div></Shell>;

  if (error || !data) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Opening not found</h1>
          <p className="text-sm text-gray-500">This internal opening is no longer available. Please contact HR.</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={28} />
          <h1 className="font-semibold text-gray-900 mb-1">Interest submitted</h1>
          <p className="text-sm text-gray-500">Thanks — HR has your interest in {data.jobTitle}. Please make sure your manager is aware you applied.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900">Express interest — {data.jobTitle}</h1>
        {data.department && <p className="text-gray-500 text-sm mt-1">{data.department}</p>}
        {data.summary && <p className="text-gray-600 text-sm mt-3 whitespace-pre-line">{data.summary}</p>}

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your work email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your current role / team</label>
            <input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
          </div>
          <p className="text-xs text-gray-400">By expressing interest you confirm you'll keep your manager informed.</p>
        </div>

        {apply.error && <p className="mt-3 text-sm text-red-600">{apply.error.message}</p>}

        <div className="mt-5">
          <button
            onClick={() => apply.mutate({ jdId, name, email, currentRole: currentRole || undefined })}
            disabled={!name.trim() || !email.trim() || apply.isLoading}
            className="px-5 py-2.5 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {apply.isLoading ? 'Submitting…' : 'Express interest'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
