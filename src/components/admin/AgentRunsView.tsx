// ============================================================
// AGENT RUNS VIEW — admin list of propose-and-approve agent runs
//
// A read-only audit surface (Contract v1.0 §3.2): every debug-agent run,
// its status, counts (proposed fixes vs routed-to-pm_review), and timing.
// Drop into the admin Feedback area as a tab/section alongside FeedbackPanel.
// Uses the agent.list tRPC query built in Stage A3.
// ============================================================

import { trpc } from '../../lib/trpc';
import { Activity, GitPullRequest, UserCheck, SkipForward, XCircle } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-gray-100 text-gray-700',
};

export default function AgentRunsView() {
  const { data, isLoading } = trpc.agent.list.useQuery({ page: 1, limit: 25 });
  const runs = data?.rows ?? [];

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500 text-sm">Loading runs…</div>;
  }
  if (runs.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Activity size={36} className="mx-auto text-gray-400 mb-2" />
        <p className="text-sm">No agent runs yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
      {runs.map((run: any) => (
        <div key={run.id} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-gray-700">{run.id}</span>
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[run.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {run.status}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {run.itemsTotal} total</span>
            <span className="inline-flex items-center gap-1 text-indigo-600"><GitPullRequest className="w-3.5 h-3.5" /> {run.itemsFixed} proposed</span>
            <span className="inline-flex items-center gap-1 text-yellow-700"><UserCheck className="w-3.5 h-3.5" /> {run.itemsPmReview} pm_review</span>
            <span className="inline-flex items-center gap-1"><SkipForward className="w-3.5 h-3.5" /> {run.itemsSkipped} skipped</span>
            {run.itemsFailed > 0 && (
              <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" /> {run.itemsFailed} failed</span>
            )}
          </div>
          {run.summary && <p className="text-xs text-gray-600 mt-1.5">{run.summary}</p>}
          <div className="text-[11px] text-gray-400 mt-1">
            {run.triggeredBy ? `${run.triggeredBy} · ` : ''}
            {run.startedAt ? new Date(run.startedAt).toLocaleString() : ''}
            {run.model ? ` · ${run.model}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
