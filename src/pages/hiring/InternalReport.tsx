import { useState, useEffect } from 'react';
import { UserCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { data: rows, isLoading } = trpc.candidates.internalPipeline.useQuery();

  // ── Leadership recipients: auto-emailed whenever an employee expresses interest ──
  const cfg = trpc.candidates.getReportConfig.useQuery();
  const saveCfg = trpc.candidates.setReportConfig.useMutation({ onSuccess: () => cfg.refetch() });

  const [recipsText, setRecipsText] = useState('');
  useEffect(() => {
    if (cfg.data) { setRecipsText((cfg.data.recipients ?? []).join(', ')); }
  }, [cfg.data]);
  const recipients = recipsText.split(/[,;\n]/).map((e) => e.trim()).filter((e) => e.includes('@'));

  const [notifyOpen, setNotifyOpen] = useState(false);
  const count = rows?.length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <UserCheck size={20} className="text-ls-primary" />
        <h1 className="text-2xl font-bold text-gray-900">Internal Pipeline</h1>
      </div>
      <p className="text-gray-500 text-sm mb-5">
        Current employees applying for other roles. Click a candidate to open their full record. Rejected and hired are excluded.
      </p>

      {/* How internal candidates get here */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-5 text-xs text-gray-600">
        Employees enter this pipeline two ways: HR announces a role internally (Job Descriptions &rarr; Announce internally) and an employee expresses interest, or HR marks an existing candidate as internal in Candidates. Either way they appear below.
      </div>

      {/* THE PIPELINE — front and center */}
      <div className="bg-white rounded-lg border border-gray-200 mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">In flight{count ? ` · ${count}` : ''}</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading&hellip;</div>
        ) : count === 0 ? (
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
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows!.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/hiring/candidates?candidate=${r.id}`)}
                  className="border-b border-gray-50 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.internalEmployee ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.jobTitle ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.department ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STAGE_COLORS[r.stage] ?? 'bg-gray-100 text-gray-600'}`}>{r.stage}</span></td>
                  <td className="px-4 py-3">{r.managerAware ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-red-600 text-xs">No</span>}</td>
                  <td className="px-4 py-3">{r.leadershipListed ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-gray-400 text-xs">—</span>}</td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-gray-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Leadership notifications — recipient list, auto-emailed on each internal interest */}
      <div className="bg-white rounded-lg border border-gray-200">
        <button
          onClick={() => setNotifyOpen((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-700"
        >
          <span className="flex items-center gap-2">
            {notifyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Leadership notifications
          </span>
          <span className="text-xs font-normal text-gray-400">
            {recipients.length ? `${recipients.length} recipient(s) · auto-notified` : 'Add recipients'}
          </span>
        </button>

        {notifyOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-4">
            <div className="text-xs text-gray-500 mb-1">Leadership recipients (comma-separated). Everyone listed here is emailed automatically whenever an employee expresses interest in an internal role.</div>
            <textarea
              value={recipsText}
              onChange={(e) => setRecipsText(e.target.value)}
              rows={2}
              placeholder="leadership@…, elt@…, hr@…"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ls-cyan"
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => saveCfg.mutate({ recipients })}
                disabled={saveCfg.isLoading}
                className="text-sm px-4 py-2 border border-ls-primary text-ls-primary rounded-md font-medium disabled:opacity-50"
              >
                {saveCfg.isLoading ? 'Saving…' : 'Save recipients'}
              </button>
              {saveCfg.isSuccess && <span className="text-xs text-green-700">Saved · {recipients.length} recipient(s).</span>}
            </div>
            <div className="text-xs text-gray-400 mt-3">Sends via SendGrid and drops a copy in the Email Test inbox. Automatic org-chart routing arrives with HRIS access. (Notifying a single candidate's own manager/leadership chain is done on that candidate's record.)</div>
          </div>
        )}
      </div>
    </div>
  );
}
