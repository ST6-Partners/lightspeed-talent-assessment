import { useState, useEffect } from 'react';
import { UserCheck } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STAGE_COLORS: Record<string, string> = {
  Applied: 'bg-purple-100 text-purple-700',
  Assessment: 'bg-blue-100 text-blue-700',
  'Work Sample': 'bg-cyan-100 text-cyan-700',
  'Values Review': 'bg-indigo-100 text-indigo-700',
  'Interview Scheduled': 'bg-amber-100 text-amber-700',
  Interviewed: 'bg-orange-100 text-orange-700',
  Offered: 'bg-green-100 text-green-700',
};

export default function InternalReport() {
  const { data: rows, isLoading } = trpc.candidates.internalPipeline.useQuery();
  const [to, setTo] = useState('');
  const emailReport = trpc.candidates.emailInternalReport.useMutation();

  // Weekly schedule config
  const cfg = trpc.candidates.getReportConfig.useQuery();
  const saveCfg = trpc.candidates.setReportConfig.useMutation({ onSuccess: () => cfg.refetch() });
  const [schedTo, setSchedTo] = useState('');
  const [schedOn, setSchedOn] = useState(false);
  useEffect(() => {
    if (cfg.data) { setSchedTo((cfg.data.recipients ?? []).join(', ')); setSchedOn(!!cfg.data.enabled); }
  }, [cfg.data]);
  const schedRecipients = schedTo.split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'));

  const recipients = to.split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <UserCheck size={20} className="text-ls-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Internal Pipeline</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">Internal candidates currently in flight, so leadership stays aware of moves in progress. Rejected and hired are excluded.</p>

      {/* Send to leadership */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-5">
        <div className="text-sm font-semibold text-gray-700 mb-2">Email this report to leadership</div>
        <textarea
          value={to}
          onChange={(e) => setTo(e.target.value)}
          rows={2}
          placeholder="leadership@…, elt@…, hr@… (comma-separated)"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => emailReport.mutate({ to: recipients })}
            disabled={recipients.length === 0 || emailReport.isLoading}
            className="text-sm px-4 py-2 bg-ls-primary text-white rounded-md font-medium hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {emailReport.isLoading ? 'Sending…' : 'Email report to leadership'}
          </button>
          {emailReport.data && <span className="text-xs text-green-700">Sent to {emailReport.data.sent} recipient(s) — {emailReport.data.count} internal candidate(s).</span>}
        </div>
        <div className="text-xs text-gray-400 mt-2">Sends via SendGrid and drops a copy in the Email Test inbox. Auto org-chart routing arrives with HRIS access.</div>
      </div>

      {/* Automatic weekly schedule */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-5">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <input type="checkbox" checked={schedOn} onChange={(e) => setSchedOn(e.target.checked)} />
          Send this report automatically every Monday (9am)
        </label>
        <textarea
          value={schedTo}
          onChange={(e) => setSchedTo(e.target.value)}
          rows={2}
          placeholder="Recipients for the weekly report — leadership@…, elt@… (comma-separated)"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => saveCfg.mutate({ recipients: schedRecipients, enabled: schedOn })}
            disabled={saveCfg.isLoading}
            className="text-sm px-4 py-2 border border-ls-primary text-ls-primary rounded-md font-medium disabled:opacity-50"
          >
            {saveCfg.isLoading ? 'Saving…' : 'Save schedule'}
          </button>
          {saveCfg.isSuccess && <span className="text-xs text-green-700">Saved. {schedOn ? `Weekly to ${schedRecipients.length} recipient(s).` : 'Automatic sending is off.'}</span>}
        </div>
        <div className="text-xs text-gray-400 mt-2">Runs on the server on a weekly cron. Recipients are set manually for now; the leadership chain fills in automatically once HRIS access lands.</div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No internal candidates in the pipeline right now.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Current role</th>
                <th className="px-4 py-3">Applying for</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Manager aware</th>
                <th className="px-4 py-3">Leadership listed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 text-sm">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.internalEmployee ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.jobTitle ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.department ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[r.stage] ?? 'bg-gray-100 text-gray-600'}`}>{r.stage}</span></td>
                  <td className="px-4 py-3">{r.managerAware ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-red-600 text-xs">No</span>}</td>
                  <td className="px-4 py-3">{r.leadershipListed ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-gray-400 text-xs">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
