import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Sparkles, ChevronDown, ChevronRight, Plus, Eye, EyeOff } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import SearchSelect from '../../components/SearchSelect';
import { suggestedValueScore, percentileToScore, bandLabel } from '../../lib/epp';

const PILLARS = ['Mission-Driven', 'Customer-Obsessed', 'Results-Focused'] as const;
const PILLAR_COLORS: Record<string, string> = {
  'Mission-Driven': 'text-purple-700',
  'Customer-Obsessed': 'text-teal-700',
  'Results-Focused': 'text-ls-primary',
};
const TEACH: Record<string, { label: string; cls: string }> = {
  hard_to_teach: { label: 'Hard to teach', cls: 'bg-red-50 text-red-700' },
  compound: { label: 'Compound', cls: 'bg-amber-50 text-amber-700' },
  learnable: { label: 'Learnable', cls: 'bg-emerald-50 text-emerald-700' },
};
const today = () => new Date().toISOString().slice(0, 10);
const snap = (rv: string, dt: string, iv: string, sc: Record<string, number>, cap: Record<string, number> = {}) =>
  JSON.stringify([rv, dt, iv,
    Object.entries(sc).filter(([, v]) => typeof v === 'number').sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    Object.entries(cap).filter(([, v]) => typeof v === 'number').sort((a, b) => (a[0] < b[0] ? -1 : 1))]);

export default function ScoreValues() {
  const [candidateId, setCandidateId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [reviewedAt, setReviewedAt] = useState(today());
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [capScores, setCapScores] = useState<Record<string, number>>({});
  const [capAiShown, setCapAiShown] = useState(false);
  const [capSuggest, setCapSuggest] = useState<Record<string, { score: number; rationale: string }>>({});
  const [capRecMode, setCapRecMode] = useState<'ai' | 'placeholder' | null>(null);
  const [capRecError, setCapRecError] = useState<string | null>(null);
  const [aiShown, setAiShown] = useState(false); // AI scorecard shown (filled) vs cleared
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [interviewId, setInterviewId] = useState('');
  const [baseline, setBaseline] = useState('');
  const loadedParamRef = useRef(false);
  const [params] = useSearchParams();

  const { data: candidates } = trpc.candidates.list.useQuery();
  const { data: values } = trpc.values.list.useQuery();
  const { data: capItems } = trpc.values.listCapabilityItems.useQuery();
  const capRecMutation = trpc.values.capabilityRecommendation.useMutation();
  const { data: reviewers } = trpc.values.listReviewers.useQuery();
  const eppQuery = trpc.values.getCandidateEpp.useQuery({ candidateId }, { enabled: !!candidateId });
  const reviewsQuery = trpc.values.getCandidateReviews.useQuery({ candidateId }, { enabled: !!candidateId });
  const roundsQuery = trpc.interviews.list.useQuery({ candidateId }, { enabled: !!candidateId });
  const saveMutation = trpc.values.saveReview.useMutation({
    onSuccess: (r, variables: any) => {
      setSaved(true); setCurrentReviewId(r.reviewId);
      const sc: Record<string, number> = {};
      (variables?.scores ?? []).forEach((x: any) => { sc[x.valueId] = x.score; });
      const cs: Record<string, number> = {};
      (variables?.capabilityScores ?? []).forEach((x: any) => { cs[x.capabilityItemId] = x.score; });
      setBaseline(snap(variables?.reviewerId ?? '', variables?.reviewedAt ?? '', variables?.interviewId ?? '', sc, cs));
      reviewsQuery.refetch(); setTimeout(() => setSaved(false), 2500);
    },
  });

  const eppByTrait = useMemo(() => {
    const m: Record<string, number> = {};
    (eppQuery.data ?? []).forEach((r: any) => { m[r.trait] = r.percentile; });
    return m;
  }, [eppQuery.data]);

  const suggestions = useMemo(() => {
    const m: Record<string, { score: number; avgPercentile: number }> = {};
    (values ?? []).forEach((v: any) => {
      const s = suggestedValueScore(v.eppDimensions ?? [], eppByTrait);
      if (s) m[v.id] = s;
    });
    return m;
  }, [values, eppByTrait]);

  // No auto pre-fill: the reviewer starts from a blank scorecard. A single
  // "AI Recommendation" toggle at the top fills BOTH sections on demand —
  // Values from the EPP mapping, Capability from the AI service.
  const anyRecShown = aiShown || capAiShown;
  const applyRecommendations = async () => {
    if (aiShown || capAiShown) {
      setScores({}); setAiShown(false);
      setCapScores({}); setCapSuggest({}); setCapRecMode(null); setCapRecError(null); setCapAiShown(false);
      return;
    }
    const m: Record<string, number> = {};
    (values ?? []).forEach((v: any) => { if (suggestions[v.id]) m[v.id] = suggestions[v.id].score; });
    setScores(m); setAiShown(true);
    if (candidateId) {
      setCapRecError(null);
      try {
        const res: any = await capRecMutation.mutateAsync({ candidateId });
        const sc: Record<string, number> = {};
        const sg: Record<string, { score: number; rationale: string }> = {};
        (res?.items ?? []).forEach((it: any) => { sc[it.capabilityItemId] = it.score; sg[it.capabilityItemId] = { score: it.score, rationale: it.rationale }; });
        if (Object.keys(sc).length) { setCapScores((prev) => ({ ...prev, ...sc })); setCapSuggest(sg); setCapRecMode(res?.mode ?? null); setCapAiShown(true); }
      } catch (err: any) {
        setCapRecError(err?.message ? `Couldn't generate the capability suggestion: ${err.message}` : "Couldn't generate the capability suggestion. Try again.");
      }
    }
  };

  // Preselect candidate + round when arrived at via a deep link from the Interviews tab.
  useEffect(() => {
    const cid = params.get('id');
    const rid = params.get('round');
    if (cid) {
      setCandidateId(cid); setCurrentReviewId(null); setReviewerId(''); setReviewedAt(today()); setScores({}); setCapScores({}); setCapAiShown(false); setCapSuggest({}); setCapRecMode(null); setCapRecError(null); setAiShown(false);
      setInterviewId(rid ?? ''); setBaseline(snap('', today(), rid ?? '', {}));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectCandidate = (id: string) => {
    setCandidateId(id); setCurrentReviewId(null); setReviewerId(''); setReviewedAt(today()); setScores({}); setCapScores({}); setCapAiShown(false); setCapSuggest({}); setCapRecMode(null); setCapRecError(null); setInterviewId(''); setAiShown(false); setBaseline(snap('', today(), '', {}));
  };
  const startNew = () => { setCurrentReviewId(null); setReviewerId(''); setReviewedAt(today()); setScores({}); setCapScores({}); setCapAiShown(false); setCapSuggest({}); setCapRecMode(null); setCapRecError(null); setAiShown(false); setBaseline(snap('', today(), interviewId, {})); };
  const loadReview = (r: any) => {
    setCurrentReviewId(r.id);
    setReviewerId(r.reviewerId ?? '');
    setInterviewId(r.interviewId ?? '');
    setReviewedAt(new Date(r.reviewedAt).toISOString().slice(0, 10));
    const m: Record<string, number> = {};
    r.scores.forEach((s: any) => { m[s.valueId] = s.score; });
    setScores(m);
    const cm: Record<string, number> = {};
    (r.capabilityScores ?? []).forEach((s: any) => { cm[s.capabilityItemId] = s.score; });
    setCapScores(cm); setCapAiShown(false); setCapSuggest({}); setCapRecMode(null); setCapRecError(null);
    setBaseline(snap(r.reviewerId ?? '', new Date(r.reviewedAt).toISOString().slice(0, 10), r.interviewId ?? '', m, cm));
  };

  // Deep link ?review=<id> from a round card: load that specific submitted scorecard.
  useEffect(() => {
    const rid = params.get('review');
    if (!rid || loadedParamRef.current) return;
    const found = ((reviewsQuery.data ?? []) as any[]).find((x) => x.id === rid);
    if (found) { loadReview(found); loadedParamRef.current = true; }
  }, [reviewsQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const byPillar = useMemo(() => {
    const g: Record<string, any[]> = { 'Mission-Driven': [], 'Customer-Obsessed': [], 'Results-Focused': [] };
    (values ?? []).forEach((v: any) => { (g[v.pillar] ??= []).push(v); });
    return g;
  }, [values]);

  const setScore = (valueId: string, score: number) => setScores((p) => ({ ...p, [valueId]: score }));
  const setCapScore = (id: string, score: number) => setCapScores((p) => ({ ...p, [id]: score }));
  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const pillarAvg = (pillar: string) => {
    const got = (byPillar[pillar] ?? []).map((v) => scores[v.id]).filter((n) => typeof n === 'number') as number[];
    return got.length ? (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1) : null;
  };
  const overall = useMemo(() => {
    const got = Object.values(scores).filter((n) => typeof n === 'number') as number[];
    return got.length ? (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1) : null;
  }, [scores]);
  const capAvg = useMemo(() => {
    const got = Object.values(capScores).filter((n) => typeof n === 'number') as number[];
    return got.length ? (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1) : null;
  }, [capScores]);
  const reviewOverall = (r: any) => {
    const got = r.scores.map((s: any) => s.score);
    return got.length ? (got.reduce((a: number, b: number) => a + b, 0) / got.length).toFixed(1) : '—';
  };

  const handleSave = () => {
    if (!candidateId || !reviewerId) return;
    saveMutation.mutate({
      reviewId: currentReviewId ?? undefined,
      candidateId, reviewerId, reviewedAt,
      interviewId: interviewId || null,
      scores: Object.entries(scores).map(([valueId, score]) => ({ valueId, score })),
      capabilityScores: Object.entries(capScores).map(([capabilityItemId, score]) => ({ capabilityItemId, score })),
    });
  };

  const isExisting = currentReviewId != null;
  const isDirty = snap(reviewerId, reviewedAt, interviewId, scores) !== baseline;
  const canSave = !!reviewerId && (Object.values(scores).some((n) => typeof n === 'number') || Object.values(capScores).some((n) => typeof n === 'number'));

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">Score Candidate on Values</h1>
        <p className="text-ls-ink-3 text-sm mt-1">EPP pre-fills a suggested score for each value — the reviewer adjusts with interview judgment.</p>
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
            <SearchSelect
              value={candidateId}
              onChange={selectCandidate}
              placeholder="Search candidates…"
              options={(candidates ?? []).map((c: any) => ({ value: c.id, label: `${c.firstName} ${c.lastName} · ${c.currentStage}` }))}
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ls-ink-2 mb-1">Reviewer</label>
            <SearchSelect
              value={reviewerId}
              onChange={setReviewerId}
              disabled={!candidateId}
              placeholder="Search reviewers…"
              options={(reviewers ?? []).map((e: any) => ({ value: e.id, label: `${e.name}${e.title ? ` · ${e.title}` : ''}` }))}
            />
          </div>
          <div className="col-span-1">
            <label className="block text-xs font-medium text-ls-ink-2 mb-1">Review date</label>
            <input type="date" value={reviewedAt} onChange={(e) => setReviewedAt(e.target.value)} disabled={!candidateId}
              className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm bg-white focus:outline-none focus:border-ls-cyan focus:ring-2 focus:ring-ls-primary-50 disabled:bg-ls-bg-2" />
          </div>
        </div>

        {candidateId && (roundsQuery.data ?? []).length > 0 && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-ls-ink-2 mb-1">
              Interview round <span className="text-ls-ink-3 font-normal">(optional — ties this scorecard to a round in the Interviews tab)</span>
            </label>
            <select value={interviewId} onChange={(e) => setInterviewId(e.target.value)}
              className="w-full px-3 py-2 border border-ls-line rounded-lg text-sm bg-white focus:outline-none focus:border-ls-cyan focus:ring-2 focus:ring-ls-primary-50">
              <option value="">General — not tied to a specific round</option>
              {(roundsQuery.data ?? []).map((r: any) => (
                <option key={r.id} value={r.id}>{r.roundName}{r.status ? ` · ${r.status}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {candidateId && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-ls-line pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ls-ink-3">Reviews:</span>
              {(reviewsQuery.data ?? []).length === 0 && <span className="text-xs text-ls-ink-3">none yet</span>}
              {(reviewsQuery.data ?? []).map((r: any) => (
                <button key={r.id} onClick={() => loadReview(r)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${currentReviewId === r.id ? 'ls-accent-grad text-white border-transparent' : 'bg-white border-ls-line text-ls-ink-2 hover:border-ls-cyan'}`}>
                  {r.reviewerName} · {reviewOverall(r)} · {new Date(r.reviewedAt).toLocaleDateString()}
                </button>
              ))}
              <button onClick={startNew}
                className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${currentReviewId === null ? 'border-ls-cyan text-ls-primary bg-ls-primary-50' : 'bg-white border-ls-line text-ls-ink-2 hover:border-ls-cyan'}`}>
                <Plus size={12} /> New review
              </button>
            </div>
            <div className="text-right flex-none">
              <div className="text-xs text-ls-ink-3">Overall</div>
              <div className="text-2xl font-extrabold text-ls-ink leading-none">{overall ?? '—'}<span className="text-sm text-ls-ink-3 font-medium"> / 5</span></div>
            </div>
          </div>
        )}
      </div>

      {candidateId && (
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-ls-primary" />
              <h3 className="text-sm font-bold text-ls-ink">AI interview summary</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-ls-primary-50 text-ls-primary border border-ls-cyan font-semibold">AI-generated</span>
            </div>
            {currentReviewId === null && (
              <button onClick={applyRecommendations} disabled={capRecMutation.isLoading || !candidateId}
                title={anyRecShown ? 'Showing AI suggestions — click to clear both sections' : 'Suggest scores for Values and Capability'}
                className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${anyRecShown ? 'border-ls-cyan text-ls-primary bg-ls-primary-50' : 'border-ls-line text-ls-ink-2 hover:border-ls-cyan'}`}>
                {capRecMutation.isLoading ? <Sparkles size={14} className="animate-pulse" /> : anyRecShown ? <Eye size={14} /> : <EyeOff size={14} />}
                {capRecMutation.isLoading ? 'Thinking…' : 'AI Recommendation'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-ls-ink-3 mb-3">Auto-generated from the interview transcript(s) to inform your scoring. Review it — it is not a decision, and it never goes to the candidate.</p>
          {(() => {
            const fbRounds = (roundsQuery.data ?? []).filter((r: any) => r.feedbackHr);
            const legacy = (candidates ?? []).find((c: any) => c.id === candidateId)?.interviewFeedbackHr;
            if (!fbRounds.length && !legacy) {
              return <div className="text-xs text-ls-ink-3">No AI interview feedback yet — add a transcript on the Interviews tab and it will appear here.</div>;
            }
            return (
              <div className="space-y-3">
                {fbRounds.map((r: any) => (
                  <div key={r.id}>
                    <div className="text-xs font-semibold text-ls-ink">{r.roundName}{r.score != null ? ` · AI score ${r.score}/100` : ''}</div>
                    <p className="text-[11px] text-ls-ink-2 whitespace-pre-wrap bg-ls-bg-2 rounded p-2 mt-1 max-h-48 overflow-y-auto">{r.feedbackHr}</p>
                  </div>
                ))}
                {!fbRounds.length && legacy && (
                  <p className="text-[11px] text-ls-ink-2 whitespace-pre-wrap bg-ls-bg-2 rounded p-2 max-h-48 overflow-y-auto">{legacy}</p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {!candidateId ? (
        <div className="bg-white rounded-xl border border-ls-line p-8 text-center text-ls-ink-3 text-sm">Pick a candidate to begin.</div>
      ) : (
        <>
          {PILLARS.map((pillar) => (
            <div key={pillar} className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-4">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className={`text-sm font-bold ${PILLAR_COLORS[pillar]}`}>{pillar}</h3>
                <span className="text-xs text-ls-ink-3">avg <b className="text-ls-ink">{pillarAvg(pillar) ?? '—'}</b></span>
              </div>
              {(byPillar[pillar] ?? []).map((v: any) => {
                const sug = aiShown ? suggestions[v.id] : undefined;
                const cur = scores[v.id];
                const adjusted = sug && cur != null && cur !== sug.score;
                const dims: string[] = Array.isArray(v.eppDimensions) ? v.eppDimensions : [];
                const isOpen = !!expanded[v.id];
                return (
                  <div key={v.id} className="py-2.5 border-t border-ls-line first:border-t-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ls-ink">{v.name}</div>
                        <div className="text-xs text-ls-ink-3">{v.description}</div>
                      </div>
                      <div className="flex gap-1.5 flex-none">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const on = cur === n;
                          const isSug = sug && sug.score === n && !on;
                          return (
                            <button key={n} onClick={() => setScore(v.id, n)} aria-pressed={on} aria-label={`${v.name} score ${n}`}
                              className={`w-8 h-8 rounded-lg border text-[13px] font-semibold flex items-center justify-center transition-colors ${
                                on ? 'ls-accent-grad text-white border-transparent'
                                : isSug ? 'bg-ls-primary-50 text-ls-primary border-ls-cyan'
                                : 'bg-white text-ls-ink-2 border-ls-line hover:border-ls-cyan'}`}>
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {sug && (
                      <button onClick={() => toggleExpand(v.id)}
                        className="mt-1.5 text-[11px] inline-flex items-center gap-1 text-ls-primary hover:underline">
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Sparkles size={11} />
                        EPP suggests {sug.score} · avg {sug.avgPercentile}th pct
                        {adjusted && <span className="text-ls-watch font-medium ml-1">· adjusted</span>}
                      </button>
                    )}
                    {sug && isOpen && (
                      <div className="mt-2 ml-4 rounded-lg bg-ls-bg-2 border border-ls-line p-3">
                        <div className="text-[11px] text-ls-ink-3 mb-1.5">EPP traits mapped to this value</div>
                        <div className="space-y-1">
                          {dims.map((t) => {
                            const p = eppByTrait[t];
                            return (
                              <div key={t} className="flex items-center gap-2 text-xs">
                                <span className="w-40 flex-none text-ls-ink-2">{t}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                                  <div className="h-full ls-accent-grad" style={{ width: `${typeof p === 'number' ? p : 0}%` }} />
                                </div>
                                <span className="w-8 text-right font-semibold text-ls-ink">{typeof p === 'number' ? p : '—'}</span>
                                <span className="w-20 text-right text-ls-ink-3">{typeof p === 'number' ? bandLabel(p) : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-[11px] text-ls-ink-2 mt-2 pt-2 border-t border-ls-line">
                          Average <b>{sug.avgPercentile}th</b> percentile → band <b>{percentileToScore(sug.avgPercentile)}</b> = EPP suggested score <b>{sug.score}</b>.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {(capItems ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-4">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-ls-ink">Capability</h3>
                  <p className="text-xs text-ls-ink-3">Can this person do the job? Score each 1–5. The AI Recommendation button up top fills this too.</p>
                </div>
                <span className="text-xs text-ls-ink-3">avg <b className="text-ls-ink">{capAvg ?? '—'}</b></span>
              </div>
              {capRecError && (
                <div className="text-[11px] text-red-600 mb-2">{capRecError}</div>
              )}
              {capAiShown && capRecMode === 'placeholder' && (
                <div className="text-[11px] text-ls-watch mb-2">Sandbox draft — no AI model connected. Set ANTHROPIC_API_KEY for a suggestion grounded in the interview notes.</div>
              )}
              {(capItems ?? []).map((it: any) => {
                const cur = capScores[it.id];
                const t = TEACH[it.teachability] ?? { label: it.teachability, cls: 'bg-ls-bg-2 text-ls-ink-2' };
                return (
                  <div key={it.id} className="py-2.5 border-t border-ls-line first:border-t-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ls-ink flex items-center gap-2 flex-wrap">
                          {it.name}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.cls}`}>{t.label}</span>
                        </div>
                        <div className="text-xs text-ls-ink-3">{it.description}</div>
                      </div>
                      <div className="flex gap-1.5 flex-none">
                        {[1, 2, 3, 4, 5].map((n) => {
                          const on = cur === n;
                          return (
                            <button key={n} onClick={() => setCapScore(it.id, n)} aria-pressed={on} aria-label={`${it.name} score ${n}`}
                              className={`w-8 h-8 rounded-lg border text-[13px] font-semibold flex items-center justify-center transition-colors ${
                                on ? 'ls-accent-grad text-white border-transparent'
                                : 'bg-white text-ls-ink-2 border-ls-line hover:border-ls-cyan'}`}>
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {capAiShown && capSuggest[it.id] && (
                      <div className="mt-1.5 text-[11px] text-ls-ink-3 flex items-start gap-1">
                        <Sparkles size={11} className="text-ls-primary mt-0.5 flex-none" />
                        <span><b className="text-ls-primary">Suggests {capSuggest[it.id].score}</b> — {capSuggest[it.id].rationale}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="mt-3 pt-3 border-t border-ls-line flex items-center gap-4 flex-wrap text-[11px] text-ls-ink-3">
                <span>Teachability:</span>
                <span className="text-red-700">Hard to teach</span>
                <span className="text-amber-700">Compound</span>
                <span className="text-emerald-700">Learnable</span>
                <span className="text-ls-ink-3">Assessments (CCAT, EPP) shown on the Assessments tab — reference, not scored here.</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mt-5">
            {(!isExisting || isDirty) ? (
              <button onClick={handleSave} disabled={saveMutation.isLoading || !canSave}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-ls-primary text-white rounded-lg text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
                {saveMutation.isLoading ? (isExisting ? 'Re-submitting…' : 'Submitting…') : (isExisting ? 'Resubmit' : 'Submit')}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-ls-thrive font-medium"><Check size={16} /> Submitted — edit any score to re-submit.</span>
            )}
            {!reviewerId && <span className="text-xs text-ls-ink-3">Select a reviewer to submit.</span>}
            {saved && <span className="inline-flex items-center gap-1.5 text-sm text-ls-thrive font-medium"><Check size={16} /> Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}
