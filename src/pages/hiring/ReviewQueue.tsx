import { useState } from 'react';
import { trpc } from '../../lib/trpc';

const TERMINAL = ['Rejected', 'Hired'];
const pct = (v: any) => (v != null ? `${v}%` : '—');

export default function ReviewQueue() {
  const { data: candidates, refetch, isLoading } = trpc.candidates.list.useQuery();
  const flagged = (candidates ?? []).filter(
    (c: any) => c.screenRecommendation === 'review' && !TERMINAL.includes(c.currentStage),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = flagged.find((c: any) => c.id === selectedId) ?? null;
  const [reason, setReason] = useState('');

  const decisions = trpc.decisions.listByCandidate.useQuery(
    { candidateId: selected?.id ?? '' },
    { enabled: !!selected },
  );
  const resolve = trpc.candidates.resolveReview.useMutation({
    onSuccess: () => { setSelectedId(null); setReason(''); refetch(); },
  });

  const reviewReason = (decisions.data ?? []).find(
    (d: any) => d.decisionType === 'post_assessment_review' && d.outcome === 'pending_review',
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Candidates who cleared the cognitive cutoff but fell below the auto-advance bar on a softer
          measure (personality/values fit, resume requirements, or work sample). No one here was
          auto-rejected. Open a candidate to see why they did not advance, then decide.
        </p>
      </div>

      <div className="flex gap-6">
        <div className={selected ? 'w-1/2' : 'w-full'}>
          {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
          {!isLoading && flagged.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No candidates awaiting review.
            </div>
          )}
          <div className="space-y-2">
            {flagged.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left bg-white rounded-lg border p-4 transition-colors ${selectedId === c.id ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Needs review</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {c.currentStage} · CCAT {c.ccatScore ?? '—'} · EPP {pct(c.eppValuesMatchScore)} · Values {pct(c.companyValuesMatchScore)} · Resume {pct(c.resumeReviewScore)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="w-1/2 bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>
            <div className="text-xs text-gray-500 mb-4">{selected.email} · {selected.currentStage}</div>

            <div className="text-xs font-medium text-gray-600 mb-1">Why this candidate did not auto-advance</div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-4">
              {reviewReason?.reason
                ?? (selected as any).companyValuesNotes
                ?? 'Below the auto-advance bar on a soft measure. See the score breakdown below.'}
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
