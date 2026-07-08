import { useState, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import SearchSelect from '../../components/SearchSelect';
import { EPP_TRAITS, bandLabel } from '../../lib/epp';

function barColor(p: number): string {
  if (p >= 70) return 'bg-ls-thrive';
  if (p >= 55) return 'bg-ls-cyan';
  if (p >= 30) return 'bg-ls-watch';
  return 'bg-ls-risk';
}
function textColor(p: number): string {
  if (p >= 70) return 'text-ls-thrive';
  if (p >= 55) return 'text-ls-primary';
  if (p >= 30) return 'text-ls-watch';
  return 'text-ls-risk';
}

export default function EppProfiles() {
  const [candidateId, setCandidateId] = useState('');
  const { data: candidates } = trpc.candidates.list.useQuery();
  const eppQuery = trpc.values.getCandidateEpp.useQuery({ candidateId }, { enabled: !!candidateId });

  const byTrait = useMemo(() => {
    const m: Record<string, number> = {};
    (eppQuery.data ?? []).forEach((r: any) => { m[r.trait] = r.percentile; });
    return m;
  }, [eppQuery.data]);

  const hasData = (eppQuery.data ?? []).length > 0;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">EPP Profiles</h1>
        <p className="text-ls-ink-3 text-sm mt-1">Criteria Employee Personality Profile — 12 traits, percentile vs. global norm</p>
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
        <SearchSelect
          value={candidateId}
          onChange={setCandidateId}
          placeholder="Search candidates…"
          options={(candidates ?? []).map((c: any) => ({ value: c.id, label: `${c.firstName} ${c.lastName} · ${c.currentStage}` }))}
        />
      </div>

      {!candidateId ? (
        <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">
          Pick a candidate to view their EPP profile.
        </div>
      ) : !hasData ? (
        <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">
          No EPP on file for this candidate yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
          <div className="space-y-3">
            {EPP_TRAITS.map((trait) => {
              const p = byTrait[trait];
              if (typeof p !== 'number') return null;
              return (
                <div key={trait} className="flex items-center gap-3">
                  <div className="w-40 flex-none text-sm text-ls-ink">{trait}</div>
                  <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="w-12 flex-none text-right text-sm font-semibold text-ls-ink">{p}</div>
                  <div className={`w-24 flex-none text-right text-xs font-medium ${textColor(p)}`}>{bandLabel(p)}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ls-ink-3 mt-4 pt-3 border-t border-ls-line">
            Percentile rankings vs. Criteria's global norm group. Bands: 85+ exceptional · 70–84 strong · 55–69 solid · 30–54 developing · &lt;30 weak.
          </p>
        </div>
      )}
    </div>
  );
}
