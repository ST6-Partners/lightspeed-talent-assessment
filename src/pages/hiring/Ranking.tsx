import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Info, AlertTriangle } from 'lucide-react';
import { trpc } from '../../lib/trpc';

function initials(first?: string, last?: string): string {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '?';
}

export default function Ranking() {
  const { jdId } = useParams();
  const navigate = useNavigate();

  const { data, refetch, isLoading } = trpc.ranking.getForRole.useQuery(
    { jdId: jdId! },
    { enabled: !!jdId },
  );
  const { data: jds } = trpc.jobDescriptions.list.useQuery();
  const { data: reqs } = trpc.requisitions.list.useQuery();

  const rankMutation = trpc.ranking.rankRole.useMutation({ onSuccess: () => refetch() });
  const rejectMutation = trpc.candidates.reject.useMutation({ onSuccess: () => refetch() });

  const jd = ((jds ?? []) as any[]).find((j) => j.id === jdId);
  const req = jd ? ((reqs ?? []) as any[]).find((r) => r.id === jd.reqId) : null;
  const title = jd?.jobTitle ?? 'Role';
  const dept = req?.department ?? '';
  const hm = req?.hiringManager ?? '';

  const run = data?.run as any;
  const rankings = (data?.rankings ?? []) as any[];
  const running = rankMutation.isLoading;

  const doReject = (candidateId: string, name: string) => {
    if (window.confirm(`Reject ${name}? This is a manual decision and is logged as yours.`)) {
      rejectMutation.mutate({ id: candidateId, reason: 'Not advanced after ranking review' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/hiring/candidates')}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"
      >
        <ArrowLeft size={14} /> Back to candidates
      </button>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">Candidate ranking</h1>
          <div className="text-sm text-gray-500 mt-0.5">
            {title}{dept ? ` · ${dept}` : ''}{hm ? ` · hiring manager ${hm}` : ''}
          </div>
        </div>
        <button
          onClick={() => jdId && rankMutation.mutate({ jdId })}
          disabled={running}
          className="flex-none flex items-center gap-1.5 text-sm px-3 py-1.5 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
        >
          <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
          {running ? 'Ranking…' : run ? 'Re-rank' : 'Rank candidates'}
        </button>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 mb-4">
        <Info size={16} className="text-ls-primary flex-none mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          Suggestions only. Nobody is advanced or rejected automatically — you make every call.
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : !run ? (
        <div className="border border-gray-200 rounded-xl bg-white p-8 text-center">
          <div className="text-sm font-medium text-gray-800">No ranking yet for this role</div>
          <div className="text-xs text-gray-500 mt-1 mb-4">
            Order the candidates who passed the assessment cutoff, best first, with a short read on each.
          </div>
          <button
            onClick={() => jdId && rankMutation.mutate({ jdId })}
            disabled={running}
            className="text-sm px-4 py-2 bg-ls-primary text-white rounded font-medium hover:bg-ls-primary-600 disabled:opacity-50"
          >
            {running ? 'Ranking…' : 'Rank candidates'}
          </button>
        </div>
      ) : (
        <>
          <div className="border border-gray-200 rounded-xl bg-white px-4 py-3 mb-4">
            <div className="text-sm text-gray-900">
              Ranked {run.totalRanked} candidate{run.totalRanked === 1 ? '' : 's'} who passed the assessment cutoff · best first
            </div>
            {run.limitedData && (
              <div className="flex items-start gap-1.5 text-xs text-gray-500 mt-1.5 leading-relaxed">
                <AlertTriangle size={13} className="flex-none mt-0.5" />
                <span>Ranked on limited role data — add responsibilities, required qualifications, and interview questions to the job description for sharper results.</span>
              </div>
            )}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {(run.criteriaSummary ?? '').split(' · ').filter(Boolean).map((c: string, i: number) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{c}</span>
              ))}
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                {rankings.length} in pool · 0 rejected by AI
              </span>
            </div>
          </div>

          {rankings.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center border border-gray-200 rounded-xl bg-white">
              No candidates in the pool for this role yet.
            </div>
          ) : (
            rankings.map((r) => {
              const name = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
              const strengths = (r.strengths ?? []) as string[];
              const concerns = (r.concerns ?? []) as string[];
              return (
                <div key={r.id} className="border border-gray-200 rounded-xl bg-white p-4 mb-2.5">
                  <div className="flex items-center gap-3">
                    <div className="min-w-[26px] h-[26px] flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-xs font-medium">{r.rank}</div>
                    <div className="w-9 h-9 rounded-full bg-blue-50 text-ls-primary flex items-center justify-center text-xs font-medium flex-none">{initials(r.firstName, r.lastName)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-gray-900 truncate">{name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 flex-none">{r.currentStage}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{r.email}</div>
                    </div>
                  </div>
                  {r.recommendation && (
                    <div className="text-[13px] text-gray-600 mt-2.5 leading-relaxed">{r.recommendation}</div>
                  )}
                  {(strengths.length > 0 || concerns.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                      <div>
                        <div className="text-[11px] text-gray-400">Strengths</div>
                        <ul className="list-disc ml-4 mt-1">
                          {strengths.map((s, i) => <li key={i} className="text-[13px] text-gray-600 leading-snug">{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[11px] text-gray-400">Probe in interview</div>
                        <ul className="list-disc ml-4 mt-1">
                          {concerns.map((c, i) => <li key={i} className="text-[13px] text-gray-600 leading-snug">{c}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3 border-t border-gray-100 pt-2.5">
                    <button
                      onClick={() => navigate('/hiring/candidates')}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                    >
                      View in candidates
                    </button>
                    <button
                      onClick={() => doReject(r.candidateId, name)}
                      disabled={rejectMutation.isLoading}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
