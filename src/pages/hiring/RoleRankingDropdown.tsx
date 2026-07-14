import { useState } from 'react';
import { ChevronDown, RefreshCw, Info, AlertTriangle, Sparkles } from 'lucide-react';
import { trpc } from '../../lib/trpc';

function initials(first?: string, last?: string): string {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '?';
}

export default function RoleRankingDropdown({ jdId }: { jdId: string }) {
  const [open, setOpen] = useState(false);
  const { data, refetch, isFetching } = trpc.ranking.getForRole.useQuery(
    { jdId },
    { enabled: open },
  );
  const rankMutation = trpc.ranking.rankRole.useMutation({ onSuccess: () => refetch() });
  const rejectMutation = trpc.candidates.reject.useMutation({ onSuccess: () => refetch() });

  const rankings = (data?.rankings ?? []) as any[];
  const total = data?.total ?? 0;
  const run = data?.run as any;
  const busy = rankMutation.isLoading;

  const doReject = (candidateId: string, name: string) => {
    if (window.confirm(`Reject ${name}? This is a manual decision, logged as yours.`)) {
      rejectMutation.mutate({ id: candidateId, reason: 'Not advanced after ranking review' });
    }
  };

  return (
    <div className="border-t border-blue-100 bg-blue-50/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ls-primary">
          <Sparkles size={16} className="text-ls-primary" />
          Candidate ranking
          {open && total > 0 && (
            <span className="text-xs text-blue-400 font-normal">top {Math.min(15, total)} of {total}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            LIVE
          </span>
          <ChevronDown size={16} className={`text-ls-primary transition-transform ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
            <Info size={14} className="text-ls-primary flex-none mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              Suggestions only, best first. New applicants are added automatically. Nobody is advanced or rejected without you.
            </div>
          </div>

          {run?.limitedData && rankings.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-3 leading-relaxed">
              <AlertTriangle size={12} className="flex-none mt-0.5" />
              <span>Ranked on limited role data — fill in the job description for sharper results.</span>
            </div>
          )}

          {isFetching && rankings.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">Loading…</div>
          ) : rankings.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-xs text-gray-500 mb-2">No ranking yet. New applicants are ranked automatically; generate one now for the current pool.</div>
              <button
                onClick={() => rankMutation.mutate({ jdId })}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-ls-primary text-white rounded font-medium disabled:opacity-50"
              >
                {busy ? 'Ranking…' : 'Rank now'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => rankMutation.mutate({ jdId })}
                  disabled={busy}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                >
                  <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
                  {busy ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {rankings.map((r, i) => {
                const name = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
                const strengths = (r.strengths ?? []) as string[];
                const concerns = (r.concerns ?? []) as string[];
                return (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-[22px] h-[22px] flex items-center justify-center rounded bg-gray-100 text-gray-500 text-xs font-medium flex-none">{i + 1}</div>
                      <div className="w-7 h-7 rounded-full bg-blue-50 text-ls-primary flex items-center justify-center text-[11px] font-medium flex-none">{initials(r.firstName, r.lastName)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-none">{r.currentStage}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">{r.email}</div>
                      </div>
                      <button
                        onClick={() => doReject(r.candidateId, name)}
                        disabled={rejectMutation.isLoading}
                        className="text-[11px] px-2 py-1 border border-gray-300 rounded text-red-600 hover:bg-red-50 flex-none disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                    {r.recommendation && (
                      <div className="text-xs text-gray-600 mt-2 leading-relaxed">{r.recommendation}</div>
                    )}
                    {(strengths.length > 0 || concerns.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">Strengths</div>
                          <ul className="list-disc ml-4 mt-1">
                            {strengths.map((s, k) => <li key={k} className="text-[11px] text-gray-600 leading-snug">{s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-gray-400">Probe in interview</div>
                          <ul className="list-disc ml-4 mt-1">
                            {concerns.map((c, k) => <li key={k} className="text-[11px] text-gray-600 leading-snug">{c}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
