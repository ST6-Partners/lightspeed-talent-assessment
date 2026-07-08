import { useState } from 'react';
import SearchSelect from '../../components/SearchSelect';
import { INSIGHTS_PROFILES, COLOURS, COLOUR_ORDER, type Energies, type ColourKey } from './insightsData';

function EnergyRow({ k, v }: { k: ColourKey; v: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-none text-sm text-ls-ink">{COLOURS[k].label}</div>
      <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: COLOURS[k].hex }} />
      </div>
      <div className="w-10 flex-none text-right text-sm font-semibold text-ls-ink">{v}%</div>
    </div>
  );
}

function Dynamics({ title, e }: { title: string; e: Energies }) {
  return (
    <div>
      <div className="text-xs font-semibold text-ls-ink-2 mb-2">{title}</div>
      <div className="space-y-2">
        {COLOUR_ORDER.map((k) => <EnergyRow key={k} k={k} v={e[k]} />)}
      </div>
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone?: 'good' | 'bad' }) {
  const dot = tone === 'good' ? 'text-ls-thrive' : tone === 'bad' ? 'text-ls-risk' : 'text-ls-cyan';
  return (
    <div>
      <h4 className="text-sm font-bold text-ls-ink mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-ls-ink-2">
            <span className={`flex-none ${dot}`}>•</span><span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const card = 'bg-white rounded-xl border border-ls-line shadow-sm p-5';

export default function InsightsResults() {
  const [id, setId] = useState(INSIGHTS_PROFILES[0].id);
  const p = INSIGHTS_PROFILES.find((x) => x.id === id) ?? INSIGHTS_PROFILES[0];

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">Insights Discovery</h1>
        <p className="text-ls-ink-3 text-sm mt-1">
          Post-hire personality profile for onboarding &amp; team fit. Four colour energies, a wheel type, and the full narrative profile.
        </p>
      </div>

      <div className={`${card} mb-5`}>
        <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
        <SearchSelect
          value={id}
          onChange={setId}
          placeholder="Search candidates…"
          options={INSIGHTS_PROFILES.map((x) => ({ value: x.id, label: `${x.name} · ${x.type}` }))}
        />
      </div>

      {/* Header */}
      <div className={`${card} mb-4`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-ls-ink">{p.name}</div>
              {p.real
                ? <span className="text-[11px] font-medium text-ls-thrive bg-ls-thrive-bg border border-ls-thrive/30 rounded-full px-2 py-0.5">Real profile (uploaded)</span>
                : <span className="text-[11px] font-medium text-ls-watch bg-ls-watch-bg border border-ls-watch/30 rounded-full px-2 py-0.5">Sample</span>}
            </div>
            <div className="text-sm text-ls-ink-3">{p.role} · completed {p.dateCompleted}</div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ls-ink px-3 py-1 rounded-full border border-ls-line">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOURS[p.lead].hex }} />
              {p.type}
            </span>
            <div className="text-xs text-ls-ink-3 mt-1">Lead: {COLOURS[p.lead].label} · Support: {COLOURS[p.supporting].label}</div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-ls-line grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-ls-ink-3 text-xs block">Conscious wheel position</span><span className="text-ls-ink font-medium">{p.consciousPosition}</span></div>
          <div><span className="text-ls-ink-3 text-xs block">Less conscious wheel position</span><span className="text-ls-ink font-medium">{p.lessConsciousPosition}</span></div>
        </div>
      </div>

      {/* Colour dynamics */}
      <div className={`${card} mb-4`}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-bold text-ls-ink">Colour dynamics</h3>
          <span className="text-xs text-ls-ink-3">Preference flow {p.preferenceFlow}</span>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Dynamics title="Persona (Conscious)" e={p.conscious} />
          <Dynamics title="Persona (Less Conscious)" e={p.lessConscious} />
        </div>
      </div>

      {/* Overview */}
      <div className={`${card} mb-4`}>
        <h3 className="text-sm font-bold text-ls-ink mb-3">Overview</h3>
        <div className="space-y-3 text-sm text-ls-ink-2">
          <div><span className="font-semibold text-ls-ink">Personal style. </span>{p.overview.personalStyle}</div>
          <div><span className="font-semibold text-ls-ink">Interacting with others. </span>{p.overview.interacting}</div>
          <div><span className="font-semibold text-ls-ink">Decision making. </span>{p.overview.decisionMaking}</div>
        </div>
      </div>

      {/* Strengths / weaknesses */}
      <div className={`${card} mb-4 grid md:grid-cols-2 gap-6`}>
        <Bullets title="Key strengths" items={p.strengths} tone="good" />
        <Bullets title="Possible weaknesses" items={p.weaknesses} tone="bad" />
      </div>

      {/* Value to team */}
      <div className={`${card} mb-4`}>
        <Bullets title="Value to the team" items={p.valueToTeam} />
      </div>

      {/* Communication */}
      <div className={`${card} mb-4 grid md:grid-cols-2 gap-6`}>
        <Bullets title="Communicating — do" items={p.commEffective} tone="good" />
        <Bullets title="Communicating — don't" items={p.commBarriers} tone="bad" />
      </div>

      {/* Blind spots + opposite type */}
      <div className={`${card} mb-4`}>
        <h3 className="text-sm font-bold text-ls-ink mb-2">Possible blind spots</h3>
        <p className="text-sm text-ls-ink-2 mb-4">{p.blindSpots}</p>
        <h3 className="text-sm font-bold text-ls-ink mb-2">Opposite type · {p.oppositeType.name}</h3>
        <p className="text-sm text-ls-ink-2">{p.oppositeType.text}</p>
      </div>

      {/* Development */}
      <div className={`${card} mb-2`}>
        <Bullets title="Suggestions for development" items={p.development} />
      </div>

      <p className="text-[11px] text-ls-ink-3 mt-3">
        Insights Discovery® is a registered trademark of The Insights Group Ltd. Nikolas Ueber is a real uploaded profile; other candidates are illustrative samples modelled on the same format.
      </p>
    </div>
  );
}
