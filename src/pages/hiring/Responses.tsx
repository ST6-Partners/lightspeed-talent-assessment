import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  submitted: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-400',
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In progress', submitted: 'Submitted', expired: 'Expired',
};

const FILTERS = ['submitted', 'in_progress', 'expired', 'scheduled', 'all'] as const;
const FILTER_LABELS: Record<string, string> = {
  submitted: 'Submitted', in_progress: 'In progress', expired: 'Expired', scheduled: 'Scheduled', all: 'All',
};

export default function Responses() {
  const [filter, setFilter] = useState<string>('submitted');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: sessions } = trpc.sessions.list.useQuery();
  const { data: packages } = trpc.packages.list.useQuery();
  const { data: tasks } = trpc.tasks.list.useQuery();

  const pkgOf = (id: string) => packages?.find((p: any) => p.id === id);
  const taskOf = (id: string | null | undefined) => (id ? tasks?.find((t: any) => t.id === id) : null);
  const pkgName = (id: string) => pkgOf(id)?.name ?? 'Unknown';

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
  const duration = (a: string | null, b: string | null) => {
    if (!a || !b) return '—';
    const mins = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
    return `${mins} min`;
  };

  const rows = (sessions ?? []).filter((s: any) => filter === 'all' || s.status === filter);

  const Block = ({ label, text }: { label: string; text: string | null }) => (
    <div className="mb-3">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-md p-3">{text && text.trim() ? text : <span className="text-gray-400">— blank —</span>}</div>
    </div>
  );

  const TaskDetail = ({ heading, task, response, showWork }: any) => (
    <div className="mb-5">
      <div className="text-sm font-semibold text-gray-900 mb-2">{heading}{task ? `: ${task.title}` : ''}</div>
      <Block label="Response" text={response} />
      <Block label="Show your work" text={showWork} />
      {task && (
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div className="text-xs text-gray-500 bg-blue-50/50 border border-blue-100 rounded-md p-2.5">
            <span className="font-semibold text-gray-600">Scoring — work quality:</span> {task.scoringGuideWork}
          </div>
          <div className="text-xs text-gray-500 bg-blue-50/50 border border-blue-100 rounded-md p-2.5">
            <span className="font-semibold text-gray-600">Scoring — AI skill:</span> {task.scoringGuideAi}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Responses</h1>
          <p className="text-gray-500 text-sm mt-1">Recorded candidate submissions. The work samples themselves live in Task Library.</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No {filter === 'all' ? '' : FILTER_LABELS[filter].toLowerCase() + ' '}responses yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Work sample</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Time used</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => {
                const pkg = pkgOf(s.packageId);
                const gTask = taskOf(pkg?.generalTaskId);
                const fTask = taskOf(pkg?.functionalTaskId);
                const open = openId === s.id;
                return (
                  <>
                    <tr key={s.id} onClick={() => setOpenId(open ? null : s.id)}
                      className="border-b border-gray-50 hover:bg-gray-50 text-sm cursor-pointer">
                      <td className="px-4 py-3 text-gray-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{s.candidateEmail}</td>
                      <td className="px-4 py-3 text-gray-600">{pkgName(s.packageId)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmt(s.submittedAt)}</td>
                      <td className="px-4 py-3 text-gray-600">{duration(s.startedAt, s.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[s.status] ?? ''}`}>{STATUS_LABELS[s.status] ?? s.status}</span>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-gray-100 bg-gray-50/40">
                        <td></td>
                        <td colSpan={5} className="px-4 py-5">
                          <div className="text-xs text-gray-500 mb-4">
                            Scheduled {fmt(s.scheduledStart)} · Started {fmt(s.startedAt)} · Submitted {fmt(s.submittedAt)}
                          </div>
                          <TaskDetail heading="General task" task={gTask} response={s.generalResponse} showWork={s.generalShowWork} />
                          <TaskDetail heading="Functional task" task={fTask} response={s.functionalResponse} showWork={s.functionalShowWork} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
