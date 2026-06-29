import { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import { trpc } from '../../lib/trpc';

const PILLARS = ['Mission-Driven', 'Customer-Obsessed', 'Results-Focused'] as const;
const PILLAR_COLORS: Record<string, string> = {
  'Mission-Driven': 'text-purple-700',
  'Customer-Obsessed': 'text-teal-700',
  'Results-Focused': 'text-ls-primary',
};

export default function ScoreValues() {
  const [candidateId, setCandidateId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  const { data: candidates } = trpc.candidates.list.useQuery();
  const { data: values } = trpc.values.list.useQuery();
  const scoresQuery = trpc.values.getCandidateScores.useQuery(
    { candidateId },
    { enabled: !!candidateId },
  );
  const saveMutation = trpc.values.saveCandidateScores.useMutation({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  useEffect(() => {
    if (scoresQuery.data) {
      const m: Record<string, number> = {};
      scoresQuery.data.forEach((s: any) => { m[s.valueId] = s.score; });
      setScores(m);
    } else {
      setScores({});
    }
  }, [scoresQuery.data, candidateId]);

  const byPillar = useMemo(() => {
    const g: Record<string, any[]> = { 'Mission-Driven': [], 'Customer-Obsessed': [], 'Results-Focused': [] };
    (values ?? []).forEach((v: any) => { (g[v.pillar] ??= []).push(v); });
    return g;
  }, [values]);

  const setScore = (valueId: string, score: number) => {
    setScores((prev) => ({ ...prev, [valueId]: score }));
  };

  const pillarAvg = (pillar: string) => {
    const vs = byPillar[pillar] ?? [];
    const got = vs.map((v) => scores[v.id]).filter((n) => typeof n === 'number') as number[];
    if (!got.length) return null;
    return (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1);
  };

  const overall = useMemo(() => {
    const got = Object.values(scores).filter((n) => typeof n === 'number') as number[];
    if (!got.length) return null;
    return (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1);
  }, [scores]);

  const scoredCount = Object.keys(scores).length;
  const totalCount = values?.length ?? 0;

  const handleSave = () => {
    if (!candidateId) return;
    const payload = Object.entries(scores).map(([valueId, score]) => ({ valueId, score }));
    saveMutation.mutate({ candidateId, scores: payload });
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">Score Candidate on Values</h1>
        <p className="text-ls-ink-3 text-sm mt-1">Select a candidate and rate them 1–5 against the Lightspeed Way</p>
      </div>

      {/* Candidate picker + overall */}
      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm bg-white focus:outline-none focus:border-ls-cyan focus:ring-2 focus:ring-ls-primary-50"
            >
              <option value="">Select a candidate…</option>
              {(candidates ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.currentStage}</option>
              ))}
            </select>
          </div>
          <div className="text-right">
            <div className="text-xs text-ls-ink-3">Overall</div>
            <div className="text-3xl font-extrabold text-ls-ink leading-none mt-1">
              {overall ?? '—'}<span className="text-sm text-ls-ink-3 font-medium"> / 5</span>
            </div>
            <div className="text-[11px] text-ls-ink-3 mt-1">{scoredCount} / {totalCount} scored</div>
          </div>
        </div>
      </div>

      {!candidateId ? (
        <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">
          Pick a candidate above to begin scoring.
        </div>
      ) : (
        <>
          {PILLARS.map((pillar) => (
            <div key={pillar} className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-4">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className={`text-sm font-bold ${PILLAR_COLORS[pillar]}`}>{pillar}</h3>
                <span className="text-xs text-ls-ink-3">avg <b className="text-ls-ink">{pillarAvg(pillar) ?? '—'}</b></span>
              </div>
              {(byPillar[pillar] ?? []).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between gap-4 py-2.5 border-t border-ls-line first:border-t-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ls-ink">{v.name}</div>
                    <div className="text-xs text-ls-ink-3">{v.description}</div>
                  </div>
                  <div className="flex gap-1.5 flex-none">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = scores[v.id] === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setScore(v.id, n)}
                          aria-pressed={on}
                          aria-label={`${v.name} score ${n}`}
                          className={`w-8 h-8 rounded-lg border text-[13px] font-semibold flex items-center justify-center transition-colors ${
                            on
                              ? 'ls-accent-grad text-white border-transparent'
                              : 'bg-white text-ls-ink-2 border-ls-line hover:border-ls-cyan'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saveMutation.isLoading || scoredCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ls-primary text-white rounded-lg text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50"
            >
              {saveMutation.isLoading ? 'Saving…' : 'Save scores'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-ls-thrive font-medium">
                <Check size={16} /> Saved
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
