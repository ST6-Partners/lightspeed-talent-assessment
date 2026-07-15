import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const TERMINAL = ['Rejected', 'Hired', 'Not Selected'];
const pct = (v: any) => (v != null ? `${v}%` : '—');

export default function ReviewQueue() {
  const { data: candidates, refetch, isLoading } = trpc.candidates.list.useQuery();
  const { data: jobDescriptions } = trpc.jobDescriptions.list.useQuery();
  const { data: requisitions } = trpc.requisitions.list.useQuery();

  const deptByReq: Record<string, string> = {};
  for (const r of (requisitions ?? []) as any[]) deptByReq[r.id] = r.department;
  const jdById: Record<string, any> = {};
  for (const j of (jobDescriptions ?? []) as any[]) jdById[j.id] = j;
  const getJdTitle = (jdId: string | null) =>
    !jdId ? 'Unassigned role' : (((jobDescriptions ?? []) as any[]).find((j: any) => j.id === jdId)?.jobTitle ?? '—');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const selected = ((candidates ?? []) as any[]).find((c: any) => c.id === selectedId) ?? null;

  const decisions = trpc.decisions.listByCandidate.useQuery(
    { candidateId: selected?.id ?? '' },
    { enabled: !!selected },
  );
  const rankRead = trpc.ranking.getForCandidate.useQuery(
    { candidateId: selected?.id ?? '' },
    { enabled: !!selected },
  );
  const resolve = trpc.candidates.resolveReview.useMutation({
    onSuccess: () => { setSelectedId(null); setReason(''); refetch(); },
  });
  const reviewReason = (decisions.data ?? []).find(
    (d: any) => d.decisionType === 'post_assessment_review' && d.outcome === 'pending_review',
  );

  // Group review-eligible candidates by role. Only roles that actually have
  // someone flagged for review are shown; each role's ranking orders the rows.
  const active = ((candidates ?? []) as any[]).filter((c: any) => !TERMINAL.includes(c.currentStage));
  const byRole = new Map<string, any[]>();
  for (const c of active) {
    const key = c.jdId ?? 'none';
    if (!byRole.has(key)) byRole.set(key, []);
    byRole.get(key)!.push(c);
  }
  const roleSections = Array.from(byRole.entries())
    .map(([jdId, cands]) => ({
      jdId,
      cands,
      title: jdId === 'none' ? 'Unassigned role' : getJdTitle(jdId),
      dept: jdId === 'none' ? '' : (deptByReq[jdById[jdId]?.reqId] ?? ''),
      hm: jdId === 'none' ? '' : (((requisitions ?? []) as any[]).find((r: any) => r.id === jdById[jdId]?.reqId)?.hiringManager ?? ''),
      reviewCount: cands.filter((c: any) => c.screenRecommendation === 'review').length,
    }))
    .filter((g) => g.reviewCount > 0)
    .sort((a, b) => b.reviewCount - a.reviewCount);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Grouped by role, best-fit first. Each role lists the candidates flagged for review — they
          cleared the cognitive cutoff but fell below the auto-advance bar on a softer measure
          (personality/values fit, resume requirements, or work sample). No one here was auto-rejected.
          Open a candidate to see why they did not advance, then decide. Use “View other candidates”
          to see the rest of the role’s pool.
        </p>
      </div>

      <div className="flex gap-6">
        <div className={selected ? 'w-1/2' : 'w-full'}>
          {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
          {!isLoading && roleSections.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No candidates awaiting review.
            </div>
          )}
          <div className="space-y-3">
            {roleSections.map((g) => (
              <RoleReviewSection key={g.jdId} group={g} selectedId={selectedId} onSelect={setSelectedId} />
            ))}
          </div>
        </div>

        {selected && (
          <div className="w-1/2 bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>
            <div className="text-xs text-gray-500 mb-4">{selected.email} · {getJdTitle(selected.jdId ?? null)} · {selected.currentStage}</div>

            <div className="text-xs font-medium text-gray-600 mb-1">Why this candidate did not auto-advance</div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-4">
              {reviewReason?.reason
                ?? (selected as any).companyValuesNotes
                ?? 'Below the auto-advance bar on a soft measure, or reviewed here as part of the role pool. See the score breakdown below.'}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {([
                ['CCAT Score', selected.ccatScore],
                ['EPP Match', pct(selected.eppValuesMatchScore)],
                ['Company-Values Match', pct((selected as any).companyValuesMatchScore)],
                ['Resume Review', pct(selected.resumeReviewScore)],
                ['Work Sample', selected.workSampleScore ?? '—'],
              ] as [string, any][]).map(([label, value]) => (
                <div key={label} className="border border-gray-100 rounded-lg p-2">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-sm font-medium text-gray-900">{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {rankRead.data && (
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-600 mb-1">AI ranking read (suggestion — you decide)</div>
                <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-3">
                  {(rankRead.data as any).recommendation && (
                    <div className="text-sm text-gray-700 mb-2 leading-relaxed">{(rankRead.data as any).recommendation}</div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Strengths</div>
                      <ul className="list-disc ml-4 mt-1">
                        {(((rankRead.data as any).strengths ?? []) as string[]).map((x, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-snug">{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Probe in interview</div>
                      <ul className="list-disc ml-4 mt-1">
                        {(((rankRead.data as any).concerns ?? []) as string[]).map((x, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-snug">{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {(rankRead.data as any).hadResume === false && (
                    <div className="text-[11px] text-amber-700 mt-2">No resume on file — ranked on limited data.</div>
                  )}
                </div>
              </div>
            )}

            <label className="block text-xs font-medium text-gray-600 mb-1">Reason / note (optional)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="Add context for your decision…"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm mb-3" />

            <div className="flex gap-2">
              <button
                onClick={() => resolve.mutate({ id: selected.id, decision: 'advance', reason: reason || undefined })}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700">
                Advance
              </button>
              <button
                onClick={() => resolve.mutate({ id: selected.id, decision: 'reject', reason: reason || undefined })}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700">
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleReviewSection({ group, selectedId, onSelect }: {
  group: any; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showOthers, setShowOthers] = useState(false);
  const jdId = group.jdId as string;

  const { data } = trpc.ranking.getForRole.useQuery(
    { jdId, limit: 200 },
    { enabled: jdId !== 'none' },
  );
  const rankings = (data?.rankings ?? []) as any[];
  const rankPos: Record<string, number> = {};
  const rankInfo: Record<string, any> = {};
  rankings.forEach((r: any, i: number) => { rankPos[r.candidateId] = i; rankInfo[r.candidateId] = r; });

  const orderBy = (a: any, b: any) => {
    const pa = rankPos[a.id] ?? 9999;
    const pb = rankPos[b.id] ?? 9999;
    if (pa !== pb) return pa - pb;
    return (b.screenScore ?? 0) - (a.screenScore ?? 0);
  };
  const needsReview = group.cands.filter((c: any) => c.screenRecommendation === 'review').sort(orderBy);
  const others = group.cands.filter((c: any) => c.screenRecommendation !== 'review').sort(orderBy);

  const row = (c: any) => {
    const info = rankInfo[c.id];
    const rankNum = rankPos[c.id] != null ? rankPos[c.id] + 1 : null;
    const flagged = c.screenRecommendation === 'review';
    const strength = Array.isArray(info?.strengths) ? info.strengths[0] : null;
    const concern = Array.isArray(info?.concerns) ? info.concerns[0] : null;
    return (
      <button key={c.id} onClick={() => onSelect(c.id)}
        className={`w-full text-left rounded-lg border p-3 transition-colors bg-white ${selectedId === c.id ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {rankNum != null && <span className="text-[11px] font-medium text-gray-400 w-6 flex-none">#{rankNum}</span>}
            <span className="font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</span>
            {flagged && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex-none">Needs review</span>}
          </div>
          <span className="text-[11px] text-gray-400 flex-none">{c.currentStage}</span>
        </div>
        <div className="text-xs text-gray-500 mt-1 ml-8">
          CCAT {c.ccatScore ?? '—'} · EPP {pct(c.eppValuesMatchScore)} · Values {pct(c.companyValuesMatchScore)} · Resume {pct(c.resumeReviewScore)}
        </div>
        {(strength || concern) && (
          <div className="text-[11px] text-gray-500 mt-1 ml-8 space-y-0.5">
            {strength && <div><span className="text-green-700 font-medium">+</span> {strength}</div>}
            {concern && <div><span className="text-red-600 font-medium">–</span> {concern}</div>}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2 flex-wrap">
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-base font-semibold text-gray-900">{group.title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{needsReview.length} to review</span>
        </div>
        <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-gray-500 flex-wrap">
          {group.dept && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{group.dept}</span>}
          {group.hm && <span>{group.hm}</span>}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-3 space-y-2">
          {needsReview.map((c: any) => row(c))}

          {others.length > 0 && (
            <div className="pt-1">
              <button onClick={() => setShowOthers((s) => !s)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors">
                <ChevronDown size={15} className={`text-gray-400 transition-transform ${showOthers ? '' : '-rotate-90'}`} />
                <span>View other candidates</span>
                <span className="text-gray-400 font-normal">· {others.length}</span>
                <span className="ml-auto text-[11px] text-gray-400">not flagged for review</span>
              </button>
              {showOthers && <div className="mt-2 space-y-2">{others.map((c: any) => row(c))}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
