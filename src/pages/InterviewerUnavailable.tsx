import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';

// Public landing page for the "I can't interview for this role" link that ships
// in the intake-approval availability email. Confirming notifies the interviewer's
// manager so coverage is arranged before candidates reach the interview stage.
export default function InterviewerUnavailable() {
  const { token = '' } = useParams();
  const [reason, setReason] = useState('');
  const ctx = trpc.scheduling.getInterviewerDeclineContext.useQuery({ token }, { enabled: !!token, retry: false });
  const decline = trpc.scheduling.declineInterview.useMutation();

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ls-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-ls-line shadow-sm p-7">{children}</div>
    </div>
  );

  if (!token || ctx.error || (!ctx.isLoading && !ctx.data)) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Link not valid</h1>
        <p className="text-sm text-ls-ink-2">This link is invalid or has expired. If you need to flag a scheduling conflict, contact the hiring team directly.</p>
      </Card>
    );
  }
  if (ctx.isLoading) {
    return <Card><p className="text-sm text-ls-ink-3">Loading…</p></Card>;
  }
  if (decline.isSuccess) {
    return (
      <Card>
        <div className="text-3xl mb-2">✓</div>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Your manager has been notified</h1>
        <p className="text-sm text-ls-ink-2">Thanks for flagging this early. We&apos;ve let your manager know so they can arrange coverage for <strong>{ctx.data!.role}</strong>. You can close this page.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h1 className="text-lg font-bold text-ls-ink mb-1">Can&apos;t interview for this role?</h1>
      <p className="text-sm text-ls-ink-2 mb-4">You were set as an interviewer for <strong>{ctx.data!.role}</strong>. Confirm below and we&apos;ll notify your manager to arrange coverage — handling it now keeps it from surfacing once candidates are in the pipeline.</p>
      <label className="block text-xs font-medium text-ls-ink-2 mb-1">Reason (optional)</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="e.g. on leave those weeks, workload, conflict of interest"
        className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan"
      />
      {decline.error && <p className="text-sm text-red-600 mb-2">{decline.error.message}</p>}
      <button
        onClick={() => decline.mutate({ token, reason: reason.trim() || undefined })}
        disabled={decline.isLoading}
        className="w-full py-2.5 rounded-lg bg-ls-primary text-white font-semibold text-sm hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {decline.isLoading ? 'Notifying…' : 'Notify my manager'}
      </button>
    </Card>
  );
}
