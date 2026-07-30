import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { trpc } from '../lib/trpc';

// Public landing page for the "Assign to someone else" link in the interviewer
// decline notification a manager receives. The manager names a replacement
// interviewer; submitting reassigns the interview for this role and fires the
// same availability request to the new person. No login needed.

// Card lives at module scope (NOT inside the component) so its identity is stable
// across renders — an inline component would remount inputs on every keystroke.
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-ls-bg flex items-center justify-center p-6">
    <div className="w-full max-w-md bg-white rounded-2xl border border-ls-line shadow-sm p-7">{children}</div>
  </div>
);

export default function InterviewerReassign() {
  const { token = '' } = useParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const ctx = trpc.scheduling.getInterviewerDeclineContext.useQuery({ token }, { enabled: !!token, retry: false });
  const reassign = trpc.scheduling.reassignInterviewer.useMutation();

  if (!token || ctx.error || (!ctx.isLoading && !ctx.data)) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Link not valid</h1>
        <p className="text-sm text-ls-ink-2">This link is invalid or has expired. To reassign an interviewer, contact the hiring team directly.</p>
      </Card>
    );
  }
  if (ctx.isLoading) return <Card><p className="text-sm text-ls-ink-3">Loading…</p></Card>;

  if (reassign.isSuccess) {
    return (
      <Card>
        <div className="text-3xl mb-2">✓</div>
        <h1 className="text-lg font-bold text-ls-ink mb-2">Interviewer reassigned</h1>
        <p className="text-sm text-ls-ink-2"><strong>{reassign.data.newName}</strong> is now set as the interviewer for <strong>{reassign.data.role}</strong> and has been sent the same availability request. You can close this page.</p>
      </Card>
    );
  }

  const canSubmit = name.trim() && /.+@.+\..+/.test(email) && !reassign.isLoading;
  return (
    <Card>
      <h1 className="text-lg font-bold text-ls-ink mb-1">Assign to someone else</h1>
      <p className="text-sm text-ls-ink-2 mb-4">{ctx.data!.interviewerEmail} can’t interview for <strong>{ctx.data!.role}</strong>. Enter who should take it on and we’ll send them the same availability request.</p>

      <label className="block text-xs font-medium text-ls-ink-2 mb-1">Replacement interviewer — name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jane Doe"
        className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan"
      />
      <label className="block text-xs font-medium text-ls-ink-2 mb-1">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="jane@lightspeedsystems.com"
        className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan"
      />

      {reassign.error && <p className="text-sm text-red-600 mb-2">{reassign.error.message}</p>}
      <button
        onClick={() => reassign.mutate({ token, name: name.trim(), email: email.trim() })}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-lg bg-ls-primary text-white font-semibold text-sm hover:bg-ls-primary-600 disabled:opacity-50"
      >
        {reassign.isLoading ? 'Reassigning…' : 'Reassign & send availability request'}
      </button>
    </Card>
  );
}
