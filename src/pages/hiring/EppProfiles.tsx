// ============================================================
// EPP PROFILES — Assessments > EPP subtab
// Criteria Employee Personality Profile: 12 traits shown as
// bipolar spectra (low descriptor ← → high descriptor) with a
// percentile marker, matching the Criteria "Score Details" view.
// ============================================================

import { useState, useMemo } from 'react';
import {
  Target, Megaphone, Trophy, ClipboardCheck, Handshake, Users,
  Crown, Flame, Lightbulb, Clock, ShieldCheck, Activity,
} from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { EPP_TRAITS } from '../../lib/epp';

// Bipolar descriptors + icon per Criteria EPP trait (low ← → high).
const TRAIT_META: Record<string, { icon: any; low: string; high: string }> = {
  'Achievement':       { icon: Target,         low: 'Impulsive',                    high: 'Goal-Oriented' },
  'Assertiveness':     { icon: Megaphone,      low: 'Deferential',                  high: 'Forceful, Dominant' },
  'Competitiveness':   { icon: Trophy,         low: 'Relaxed',                      high: 'Competitive' },
  'Conscientiousness': { icon: ClipboardCheck, low: 'Spontaneous, Laid-Back',       high: 'Dependable, Self-Disciplined' },
  'Cooperativeness':   { icon: Handshake,      low: 'Aggressive, Independent',      high: 'Accommodating' },
  'Extroversion':      { icon: Users,          low: 'Introverted, Low-Key',         high: 'Extroverted, Sociable' },
  'Managerial':        { icon: Crown,          low: 'Follower',                     high: 'Leader' },
  'Motivation':        { icon: Flame,          low: 'Mellow',                       high: 'Committed, Driven' },
  'Openness':          { icon: Lightbulb,      low: 'Conventional, Traditional',    high: 'Experimental, Creative' },
  'Patience':          { icon: Clock,          low: 'Impatient',                    high: 'Patient' },
  'Self-Confidence':   { icon: ShieldCheck,    low: 'Timid, Lacks Self-Assurance',  high: 'Self-Confident' },
  'Stress Tolerance':  { icon: Activity,       low: 'Excitable',                    high: 'Calm, Even-Tempered' },
};

const MARKER = '#1f3a5f'; // Criteria navy

function SpectrumRow({ trait, percentile }: { trait: string; percentile: number }) {
  const meta = TRAIT_META[trait];
  const Icon = meta?.icon ?? Target;
  const p = Math.max(0, Math.min(100, Math.round(percentile)));
  return (
    <div className="flex items-center gap-4 py-3 border-b border-ls-line last:border-0">
      <Icon size={20} className="text-ls-primary flex-none" aria-hidden />
      <div className="w-36 flex-none text-sm font-semibold text-ls-ink">{trait}</div>
      <div className="w-28 flex-none text-right text-[11px] leading-tight text-ls-ink-3">{meta?.low}</div>

      <div className="flex-1 relative h-7">
        {/* ruler track */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 rounded bg-ls-bg-2 flex overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-white/70 last:border-0" />
          ))}
        </div>
        {/* percentile marker */}
        <div
          className="absolute top-1/2 flex items-center justify-center rounded-full text-white text-[11px] font-semibold shadow"
          style={{ left: `${p}%`, transform: 'translate(-50%, -50%)', width: 28, height: 28, backgroundColor: MARKER }}
        >
          {p}
        </div>
      </div>

      <div className="w-28 flex-none text-[11px] leading-tight text-ls-ink-3">{meta?.high}</div>
    </div>
  );
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
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">EPP Profiles</h1>
        <p className="text-ls-ink-3 text-sm mt-1">Criteria Employee Personality Profile — 12 traits, percentile vs. global norm</p>
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
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
          <div className="text-sm font-semibold text-ls-ink mb-2">Score Details</div>
          <div>
            {EPP_TRAITS.map((trait) => {
              const p = byTrait[trait];
              if (typeof p !== 'number') return null;
              return <SpectrumRow key={trait} trait={trait} percentile={p} />;
            })}
          </div>
          <p className="text-[11px] text-ls-ink-3 mt-4 pt-3 border-t border-ls-line">
            Percentile (0–100) vs. Criteria's global norm group. The marker sits toward the descriptor the candidate leans to.
          </p>
        </div>
      )}
    </div>
  );
}
