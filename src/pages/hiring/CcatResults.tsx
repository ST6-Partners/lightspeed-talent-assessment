import { useState } from 'react';
import SearchSelect from '../../components/SearchSelect';

// Sample CCAT (Criteria Cognitive Aptitude Test) results — illustrative data
// showing what a completed CCAT looks like: raw score out of 50, overall
// percentile vs. the applicant norm group, and the three sub-areas Criteria
// reports (Verbal, Math & Logic, Spatial Reasoning). Wire to criteriaCorp.ts
// once the live Criteria account keys are set.

type Ccat = {
  name: string;
  role: string;
  raw: number;        // 0–50 correct
  percentile: number; // overall percentile
  verbal: number;     // sub-area percentiles
  mathLogic: number;
  spatial: number;
};

const SAMPLE: Ccat[] = [
  { name: 'Maya Chen',      role: 'Software Engineer',   raw: 41, percentile: 95, verbal: 92, mathLogic: 97, spatial: 88 },
  { name: 'Priya Nair',     role: 'Product Manager',     raw: 36, percentile: 86, verbal: 90, mathLogic: 82, spatial: 79 },
  { name: 'Daniel Reyes',   role: 'Software Engineer',   raw: 33, percentile: 78, verbal: 74, mathLogic: 84, spatial: 72 },
  { name: 'Aisha Bello',    role: 'Implementation Lead', raw: 29, percentile: 66, verbal: 71, mathLogic: 60, spatial: 64 },
  { name: 'Tom Fisher',     role: 'Account Executive',   raw: 24, percentile: 50, verbal: 58, mathLogic: 44, spatial: 47 },
  { name: 'Greg Olsen',     role: 'Account Executive',   raw: 18, percentile: 32, verbal: 40, mathLogic: 28, spatial: 33 },
];

// Illustrative Criteria-style recommended raw-score range by role family.
const ROLE_RANGE: Record<string, [number, number]> = {
  'Software Engineer':   [31, 38],
  'Product Manager':     [30, 36],
  'Implementation Lead': [26, 32],
  'Account Executive':   [21, 28],
};

function band(p: number): { label: string; text: string; bar: string } {
  if (p >= 85) return { label: 'Exceptional', text: 'text-ls-thrive', bar: 'bg-ls-thrive' };
  if (p >= 70) return { label: 'Strong',      text: 'text-ls-primary', bar: 'bg-ls-cyan' };
  if (p >= 50) return { label: 'Solid',       text: 'text-ls-primary', bar: 'bg-ls-cyan' };
  if (p >= 30) return { label: 'Developing',  text: 'text-ls-watch', bar: 'bg-ls-watch' };
  return { label: 'Below range', text: 'text-ls-risk', bar: 'bg-ls-risk' };
}

function Bar({ label, p }: { label: string; p: number }) {
  const b = band(p);
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-none text-sm text-ls-ink">{label}</div>
      <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden">
        <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${p}%` }} />
      </div>
      <div className="w-10 flex-none text-right text-sm font-semibold text-ls-ink">{p}</div>
    </div>
  );
}

export default function CcatResults() {
  const [selName, setSelName] = useState(SAMPLE[0].name);
  const c = SAMPLE.find((x) => x.name === selName) ?? SAMPLE[0];
  const range = ROLE_RANGE[c.role];
  const inRange = range ? (c.raw >= range[0] ? (c.raw <= range[1] ? 'in range' : 'above range') : 'below range') : null;
  const b = band(c.percentile);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ls-ink">CCAT Results</h1>
        <p className="text-ls-ink-3 text-sm mt-1">
          Criteria Cognitive Aptitude Test — 50 questions in 15 minutes. Raw score, overall percentile, and sub-area breakdown.
        </p>
      </div>

      <div className="mb-4 inline-block text-[11px] font-medium text-ls-watch bg-ls-watch-bg border border-ls-watch/30 rounded-full px-2.5 py-1">
        Sample data — illustrative of live CCAT output
      </div>

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
        <SearchSelect
          value={selName}
          onChange={setSelName}
          placeholder="Search candidates…"
          options={SAMPLE.map((x) => ({ value: x.name, label: `${x.name} · ${x.role}` }))}
        />
      </div>
      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-ls-ink">{c.name}</div>
            <div className="text-sm text-ls-ink-3">{c.role}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-ls-ink leading-none">{c.raw}<span className="text-base text-ls-ink-3 font-medium">/50</span></div>
            <div className={`text-xs font-medium mt-1 ${b.text}`}>{c.percentile}th percentile · {b.label}</div>
          </div>
        </div>

        <div className="space-y-3">
          <Bar label="Verbal" p={c.verbal} />
          <Bar label="Math & Logic" p={c.mathLogic} />
          <Bar label="Spatial" p={c.spatial} />
        </div>

        {range && (
          <div className="mt-4 pt-3 border-t border-ls-line flex items-center justify-between text-sm">
            <span className="text-ls-ink-3">Recommended raw range for {c.role}: <b className="text-ls-ink">{range[0]}–{range[1]}</b></span>
            <span className={`text-xs font-semibold ${inRange === 'in range' ? 'text-ls-thrive' : inRange === 'above range' ? 'text-ls-primary' : 'text-ls-watch'}`}>
              {c.name.split(' ')[0]} is {inRange}
            </span>
          </div>
        )}
        <p className="text-[11px] text-ls-ink-3 mt-3">
          Percentiles vs. Criteria's applicant norm group. Bands: 85+ exceptional · 70–84 strong · 50–69 solid · 30–49 developing · &lt;30 below range.
        </p>
      </div>
    </div>
  );
}
