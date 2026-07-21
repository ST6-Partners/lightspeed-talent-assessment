import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import SearchSelect from '../../components/SearchSelect';

// CCAT (Criteria Cognitive Aptitude Test) results for real candidates.
// Reads live candidate records via candidates.list — each row carries the raw
// score (0–50), overall percentile, and the three sub-area percentiles Criteria
// reports (Verbal, Math & Logic, Spatial). Scores land on the candidate when the
// assessment is completed (Criteria webhook / Refresh scores in the Candidates
// panel). Until a real CRITERIA_API_KEY is configured, the app runs in sandbox
// mode and these values are simulated demo data rather than live Criteria output.

// Illustrative Criteria-style recommended raw-score range by role family.
// Best-effort: only applies when a candidate's role title matches a key.
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

function Bar({ label, p }: { label: string; p: number | null }) {
  if (p == null) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-28 flex-none text-sm text-ls-ink">{label}</div>
        <div className="flex-1 h-2.5 rounded-full bg-ls-bg-2 overflow-hidden" />
        <div className="w-16 flex-none text-right text-xs text-ls-ink-3">Not reported</div>
      </div>
    );
  }
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

type Row = {
  id: string;
  name: string;
  role: string;
  raw: number;
  percentile: number | null;
  verbal: number | null;
  mathLogic: number | null;
  spatial: number | null;
};

export default function CcatResults() {
  const { data: candidates, isLoading } = trpc.candidates.list.useQuery();
  const { data: jds } = trpc.jobDescriptions.list.useQuery();

  const jdTitle = (jdId: string | null | undefined) =>
    (jds ?? []).find((j: any) => j.id === jdId)?.jobTitle ?? '—';

  // Only candidates who have completed the CCAT (a raw score is on file).
  const rows: Row[] = (candidates ?? [])
    .filter((c: any) => c.ccatScore != null)
    .map((c: any) => ({
      id: c.id,
      name: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Unnamed candidate',
      role: jdTitle(c.jdId),
      raw: c.ccatScore as number,
      percentile: c.ccatPercentile ?? null,
      verbal: c.ccatVerbal ?? null,
      mathLogic: c.ccatMathLogic ?? null,
      spatial: c.ccatSpatial ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [selId, setSelId] = useState<string>('');
  const c = rows.find((x) => x.id === selId) ?? rows[0] ?? null;

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-ls-ink">CCAT Results</h1>
      <p className="text-ls-ink-3 text-sm mt-1">
        Criteria Cognitive Aptitude Test — 50 questions in 15 minutes. Raw score, overall percentile, and sub-area breakdown.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        {header}
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 text-sm text-ls-ink-3">
          Loading candidate results…
        </div>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="max-w-3xl">
        {header}
        <div className="bg-white rounded-xl border border-ls-line shadow-sm p-8 text-center">
          <div className="text-sm font-semibold text-ls-ink mb-1">No completed CCAT results yet</div>
          <p className="text-sm text-ls-ink-3">
            Scores appear here once a candidate reaches the Assessment stage and the CCAT is completed.
            Send an assessment and use “Refresh scores” in the Candidates panel to pull results.
          </p>
        </div>
      </div>
    );
  }

  const range = ROLE_RANGE[c.role];
  const inRange = range ? (c.raw >= range[0] ? (c.raw <= range[1] ? 'in range' : 'above range') : 'below range') : null;
  const b = c.percentile != null ? band(c.percentile) : null;

  return (
    <div className="max-w-3xl">
      {header}

      <div className="bg-white rounded-xl border border-ls-line shadow-sm p-5 mb-5">
        <label className="block text-xs font-medium text-ls-ink-2 mb-1">Candidate</label>
        <SearchSelect
          value={c.id}
          onChange={setSelId}
          placeholder="Search candidates…"
          options={rows.map((x) => ({ value: x.id, label: `${x.name} · ${x.role}` }))}
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
            {c.percentile != null && b
              ? <div className={`text-xs font-medium mt-1 ${b.text}`}>{c.percentile}th percentile · {b.label}</div>
              : <div className="text-xs font-medium mt-1 text-ls-ink-3">Percentile not reported</div>}
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
