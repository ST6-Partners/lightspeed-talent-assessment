import { useState } from 'react';

// Sample Insights Discovery results — illustrative post-hire data used for
// onboarding + team fit. Insights Discovery (Jungian model) scores four colour
// energies and places a person into one of eight wheel types with a lead and a
// supporting colour. Shown here with sample profiles + a team colour mix.

const COLORS = {
  red:    { key: 'red',    label: 'Fiery Red',      hex: '#E5352B' },
  yellow: { key: 'yellow', label: 'Sunshine Yellow', hex: '#F5B800' },
  green:  { key: 'green',  label: 'Earth Green',    hex: '#2E9E4F' },
  blue:   { key: 'blue',   label: 'Cool Blue',      hex: '#1E7FC2' },
} as const;

type Energies = { red: number; yellow: number; green: number; blue: number }; // sum ~100

type Profile = {
  name: string;
  role: string;
  type: string;   // one of the 8 wheel types
  lead: keyof typeof COLORS;
  blurb: string;
  energies: Energies;
};

const SAMPLE: Profile[] = [
  { name: 'Maya Chen', role: 'Software Engineer', type: 'Motivating Director', lead: 'red',
    blurb: 'Decisive and results-driven. Sets a fast pace, welcomes a challenge, and wants the headline before the detail.',
    energies: { red: 38, yellow: 30, green: 14, blue: 18 } },
  { name: 'Priya Nair', role: 'Product Manager', type: 'Inspiring Motivator', lead: 'yellow',
    blurb: 'Outgoing and persuasive. Builds energy in a room, thinks out loud, and rallies people around a vision.',
    energies: { yellow: 40, red: 24, green: 22, blue: 14 } },
  { name: 'Aisha Bello', role: 'Implementation Lead', type: 'Supporting Helper', lead: 'green',
    blurb: 'Patient and people-first. Listens for consensus, protects relationships, and follows through dependably.',
    energies: { green: 36, yellow: 28, blue: 22, red: 14 } },
  { name: 'Tom Fisher', role: 'Account Executive', type: 'Observing Reformer', lead: 'blue',
    blurb: 'Precise and analytical. Wants the data, weighs options carefully, and values accuracy over speed.',
    energies: { blue: 42, green: 26, red: 18, yellow: 14 } },
  { name: 'Daniel Reyes', role: 'Software Engineer', type: 'Coordinating Supporter', lead: 'green',
    blurb: 'Steady and organised. Brings structure and calm, and keeps commitments on track without fuss.',
    energies: { green: 34, blue: 30, yellow: 20, red: 16 } },
];

const ORDER: (keyof typeof COLORS)[] = ['red', 'yellow', 'green', 'blue'];

function EnergyBars({ e }: { e: Energies }) {
  return (
    <div className="space-y-2">
      {ORDER.map((k) => (
        <div key={k} className="flex items-center gap-3">
          <div className="w-28 flex-none text-sm text-ls-ink">{COLORS[k].label}</div>
          <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${e[k]}%`, backgroundColor: COLORS[k].hex }} />
          </div>
          <div className="w-10 flex-none text-right text-sm font-semibold text-ls-ink">{e[k]}</div>
        </div>
      ))}
    </div>
  );
}

export default function InsightsResults() {
  const [sel, setSel] = useState(0);
  const p = SAMPLE[sel];

  // Team colour mix = average of the sample energies.
  const team: Energies = ORDER.reduce((acc, k) => {
    acc[k] = Math.round(SAMPLE.reduce((s, x) => s + x.energies[k], 0) / SAMPLE.length);
    return acc;
  }, { red: 0, yellow: 0, green: 0, blue: 0 } as Energies);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">Insights Discovery</h1>
        <p className="text-ls-ink-3 text-sm mt-1">
          Post-hire personality profile for onboarding &amp; team fit. Four colour energies and a wheel type with a lead and supporting colour.
        </p>
      </div>

      <div className="mb-3 inline-block text-[11px] font-medium text-ls-watch bg-ls-watch-bg border border-ls-watch/30 rounded-full px-2.5 py-1">
        Sample data — illustrative of a live Insights Discovery profile
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {SAMPLE.map((x, i) => (
          <button key={x.name} onClick={() => setSel(i)}
            className={`text-sm px-3 py-1.5 rounded-full border inline-flex items-center gap-2 ${i === sel ? 'bg-ls-primary-50 border-ls-cyan text-ls-primary' : 'bg-white border-ls-line text-ls-ink-2 hover:border-ls-cyan'}`}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[x.lead].hex }} />
            {x.name}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-ls-ink">{p.name}</div>
            <div className="text-sm text-ls-ink-3">{p.role}</div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ls-ink px-3 py-1 rounded-full border border-ls-line">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[p.lead].hex }} />
              {p.type}
            </span>
            <div className="text-xs text-ls-ink-3 mt-1">Lead energy: {COLORS[p.lead].label}</div>
          </div>
        </div>
        <p className="text-sm text-ls-ink-2 mb-4">{p.blurb}</p>
        <EnergyBars e={p.energies} />
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
        <h3 className="text-sm font-bold text-ls-ink mb-1">Team colour mix</h3>
        <p className="text-xs text-ls-ink-3 mb-4">Average across the {SAMPLE.length} sample hires — used to spot where a team leans and where it may have blind spots.</p>
        <div className="flex h-4 w-full rounded-full overflow-hidden mb-3">
          {ORDER.map((k) => (
            <div key={k} style={{ width: `${team[k]}%`, backgroundColor: COLORS[k].hex }} title={`${COLORS[k].label} ${team[k]}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-ls-ink-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[k].hex }} />
              {COLORS[k].label} · {team[k]}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
