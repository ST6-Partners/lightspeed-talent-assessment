// ============================================================
// METRICS PAGE — hiring pipeline analytics.
// Navy hero holds the title, role filter, view tabs and the KPI
// tiles; below it a stage-by-stage conversion funnel, application
// volume, avg days per stage, sources, rejection reasons and an
// assessment-quality panel. Tabs: Overview (all-time), Weekly,
// Quarterly (period reports with vs-prior-period deltas). Weekly
// and Quarterly also expose the automated report-email schedule.
// ============================================================

import { useState } from 'react';
import { trpc } from '../../lib/trpc';

// ── Colour helpers ─────────────────────────────────────────
// Funnel segments fade from Lightspeed cyan (light) → deep navy (dark).
function funnelShade(i: number, n: number) {
  const a = [78, 171, 210], b = [11, 29, 64];
  const t = n <= 1 ? 0 : i / (n - 1);
  const c = a.map((x, k) => Math.round(x + (b[k] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function readableInk(i: number, n: number) {
  const a = [78, 171, 210], b = [11, 29, 64];
  const t = n <= 1 ? 0 : i / (n - 1);
  const lum = a.reduce((s, x, k) => s + (x + (b[k] - x) * t) * [0.299, 0.587, 0.114][k], 0);
  return lum > 150 ? '#0B1D40' : '#ffffff';
}
const SOURCE_COLORS = ['#2E89B8', '#4EABD2', '#14b8a6', '#6FBCE0', '#8A969E', '#c4b5fd', '#f59e0b'];
// Pipeline stages shown in the funnel (closed/rejected stages excluded).
const FUNNEL_STAGES = ['Applied', 'Assessment', 'Values Review', 'Phone Screen', 'Interview Scheduled', 'Interviewed', 'Work Sample', 'Offered', 'Hired'];

// ── Small building blocks ──────────────────────────────────
function Card({ title, children, className = '' }: { title?: string; children: any; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      {title && <div className="text-sm font-semibold text-gray-700 mb-4">{title}</div>}
      {children}
    </div>
  );
}

function KpiTile({ label, value, unit, sub, delta }: {
  label: string; value: string | number; unit?: string; sub?: string; delta?: number | null;
}) {
  const dcls = delta == null ? '' : delta > 0 ? 'bg-emerald-400/20 text-emerald-300' : delta < 0 ? 'bg-rose-400/20 text-rose-200' : 'bg-white/15 text-white/70';
  return (
    <div className="relative bg-white/[.06] border border-white/10 rounded-xl px-4 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[.07em] text-white/55 leading-tight">{label}</div>
      <div className="mt-2 text-[26px] font-extrabold text-white leading-none">
        {value}{unit && <span className="text-sm font-semibold text-white/45 ml-0.5">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-white/55 mt-2">{sub}</div>}
      {delta != null && (
        <span className={`absolute top-3 right-3 text-[11px] font-bold px-2 py-0.5 rounded-full ${dcls}`}>
          {delta > 0 ? '+' : ''}{delta}
        </span>
      )}
    </div>
  );
}

// ── Stage-by-stage conversion funnel (horizontal band) ─────
function ConversionFunnel({ funnel }: { funnel: { stage: string; count: number }[] }) {
  const byStage: Record<string, number> = {};
  funnel.forEach((f) => { byStage[f.stage] = f.count; });
  const steps = FUNNEL_STAGES
    .map((s) => ({ stage: s, count: byStage[s] ?? 0 }))
    .filter((s, i) => i === 0 || s.count > 0); // always keep Applied; drop empty trailing stages
  const n = steps.length;
  if (steps.every((s) => s.count === 0)) {
    return <div className="text-sm text-gray-400 py-6 text-center">No pipeline data yet.</div>;
  }
  return (
    <div className="flex rounded-xl overflow-hidden border border-gray-200">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : 0;
        const conv = i > 0 && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        const ink = readableInk(i, n);
        return (
          <div key={s.stage} className="flex-1 min-w-[92px] px-3 py-3.5"
            style={{ background: funnelShade(i, n), color: ink }}>
            <div className="text-2xl font-extrabold leading-none">{s.count}</div>
            <div className="text-[11.5px] font-semibold mt-1 leading-tight" style={{ opacity: 0.92 }}>{s.stage}</div>
            <div className="text-[10.5px] mt-1" style={{ opacity: 0.72 }}>
              {i === 0 ? 'start' : conv != null ? `${conv}% →` : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Application volume bars ─────────────────────────────────
function VolumeChart({ weeklyVolume }: { weeklyVolume: { week: string; count: number }[] }) {
  if (weeklyVolume.length === 0) return <div className="text-sm text-gray-400 py-6 text-center">No data yet.</div>;
  const max = Math.max(...weeklyVolume.map((w) => w.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-40">
      {weeklyVolume.map((w) => (
        <div key={w.week} className="flex-1 flex flex-col items-center gap-1 justify-end">
          <div className="text-[10px] text-gray-500 font-semibold">{w.count}</div>
          <div className="w-full bg-ls-cyan rounded-t" style={{ height: `${Math.max((w.count / max) * 100, w.count > 0 ? 5 : 0)}%` }} />
          <div className="text-[9px] text-gray-400 truncate w-full text-center">{w.week}</div>
        </div>
      ))}
    </div>
  );
}

// ── Horizontal bar list (avg days / rejection reasons) ─────
function HBars({ rows, unit = '', color = 'bg-ls-cyan', empty }: {
  rows: { label: string; value: number }[]; unit?: string; color?: string; empty: string;
}) {
  if (rows.length === 0) return <div className="text-sm text-gray-400 py-6 text-center">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-40 text-xs text-gray-600 text-right truncate shrink-0">{r.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
            <div className={`h-5 rounded-full ${color}`} style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 6 : 0)}%` }} />
          </div>
          <div className="text-xs font-semibold text-gray-700 w-12 text-right">{r.value}{unit}</div>
        </div>
      ))}
    </div>
  );
}

// ── Sources donut ──────────────────────────────────────────
function SourcesDonut({ sourceMix }: { sourceMix: { source: string; count: number }[] }) {
  if (sourceMix.length === 0) return <div className="text-sm text-gray-400 py-6 text-center">No source data yet.</div>;
  const total = sourceMix.reduce((s, x) => s + x.count, 0);
  let acc = 0;
  const seg = sourceMix.map((s, i) => {
    const a = (acc / total) * 360; acc += s.count; const b = (acc / total) * 360;
    return `${SOURCE_COLORS[i % SOURCE_COLORS.length]} ${a}deg ${b}deg`;
  }).join(',');
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <div style={{ width: 132, height: 132, borderRadius: '50%', background: `conic-gradient(${seg})` }} />
        <div className="absolute inset-0 m-auto bg-white rounded-full flex flex-col items-center justify-center" style={{ width: 78, height: 78 }}>
          <div className="text-xl font-extrabold text-gray-900 leading-none">{sourceMix.length}</div>
          <div className="text-[10px] text-gray-400">sources</div>
        </div>
      </div>
      <div className="flex-1 text-xs space-y-1.5">
        {sourceMix.map((s, i) => (
          <div key={s.source} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
            <span className="text-gray-600">{s.source}</span>
            <span className="ml-auto font-semibold text-gray-800">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Assessment quality (pass-rate bars) ────────────────────
function QualityBar({ label, pct, detail }: { label: string; pct: number | null; detail: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{pct == null ? '—' : `${pct}%`}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-2.5 rounded-full ls-accent-grad" style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className="text-[11px] text-gray-400 mt-1">{detail}</div>
    </div>
  );
}
function AssessmentQuality({ ccat, epp, workSample }: { ccat: any; epp: any; workSample: any }) {
  const rate = (s: any) => (s && s.total ? Math.round((s.passed / s.total) * 100) : null);
  return (
    <div>
      <QualityBar label="CCAT pass rate" pct={rate(ccat)} detail={ccat ? `${ccat.passed}/${ccat.total} scored ≥ 30` : 'No scores yet'} />
      <QualityBar label="EPP values pass" pct={rate(epp)} detail={epp ? `${epp.passed}/${epp.total} matched ≥ 70%` : 'No scores yet'} />
      <QualityBar label="Work sample clear" pct={rate(workSample)} detail={workSample ? `${workSample.passed}/${workSample.total} scored ≥ ${workSample.passThreshold}` : 'No submissions yet'} />
    </div>
  );
}

// ── Charts area (everything below the hero) ────────────────
function Charts({ data }: { data: any }) {
  const { funnel, weeklyVolume, timeInStage, sourceMix, rejectionReasons, ccat, epp, workSample } = data;
  return (
    <div className="space-y-4">
      <Card title="Conversion funnel — stage by stage">
        <ConversionFunnel funnel={funnel} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Application volume (last 12 weeks)">
          <VolumeChart weeklyVolume={weeklyVolume} />
        </Card>
        <Card title="Avg days in each stage">
          <HBars rows={timeInStage.map((t: any) => ({ label: t.stage, value: t.avgDays }))} unit="d" color="bg-ls-primary" empty="Not enough history yet." />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Application sources">
          <SourcesDonut sourceMix={sourceMix} />
        </Card>
        <Card title="Rejection reasons">
          <HBars rows={rejectionReasons.map((r: any) => ({ label: r.reason, value: r.count }))} color="bg-rose-400" empty="No rejections yet." />
        </Card>
        <Card title="Assessment quality">
          <AssessmentQuality ccat={ccat} epp={epp} workSample={workSample} />
        </Card>
      </div>
    </div>
  );
}

// ── Date range helpers ─────────────────────────────────────
const iso = (d: Date) => d.toISOString();
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function weekRange(offset: number) {
  const now = new Date();
  const sinceMon = (now.getDay() + 6) % 7;
  const from = startOfDay(new Date(now));
  from.setDate(from.getDate() - sinceMon - offset * 7);
  const to = new Date(from); to.setDate(to.getDate() + 7);
  const cFrom = new Date(from); cFrom.setDate(cFrom.getDate() - 7);
  const label = offset === 0 ? 'This week' : offset === 1 ? 'Last week' : `${offset} weeks ago`;
  return { from: iso(from), to: iso(to), compareFrom: iso(cFrom), compareTo: iso(from), label };
}
function quarterRange(offset: number) {
  const now = new Date();
  const qStart = Math.floor(now.getMonth() / 3) * 3;
  const from = new Date(now.getFullYear(), qStart - offset * 3, 1);
  const to = new Date(now.getFullYear(), qStart - offset * 3 + 3, 1);
  const cFrom = new Date(from.getFullYear(), from.getMonth() - 3, 1);
  const q = Math.floor(from.getMonth() / 3) + 1;
  const label = `Q${q} ${from.getFullYear()}`;
  return { from: iso(from), to: iso(to), compareFrom: iso(cFrom), compareTo: iso(from), label };
}

// ── Schedule helpers ───────────────────────────────────────
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad2 = (n: number) => String(n).padStart(2, '0');
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtClock(hour: number, minute: number) {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:${pad2(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}
function nextWeekly(dayOfWeek: number, hour: number, minute: number) {
  const now = new Date();
  const d = new Date(now); d.setHours(hour, minute, 0, 0);
  let add = (dayOfWeek - now.getDay() + 7) % 7;
  if (add === 0 && d <= now) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}
function nextQuarterly(dayOfMonth: number, hour: number, minute: number) {
  const now = new Date();
  for (let y = 0; y <= 1; y++) {
    for (const m of [0, 3, 6, 9]) {
      const d = new Date(now.getFullYear() + y, m, dayOfMonth, hour, minute, 0, 0);
      if (d > now) return d;
    }
  }
  return null;
}
const fmtWhen = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// ── Schedule + recipients card (shown inside Weekly / Quarterly) ─────
function ScheduleCard({ cadence, blurb }: { cadence: 'weekly' | 'quarterly'; blurb: string }) {
  const cfg = trpc.insights.getReportConfig.useQuery({ cadence });
  const save = trpc.insights.setReportConfig.useMutation({ onSuccess: () => cfg.refetch() });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [recips, setRecips] = useState<string | null>(null);
  const [dow, setDow] = useState<number | null>(null);
  const [dom, setDom] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const sched: any = cfg.data?.schedule ?? {};
  const curEnabled = enabled ?? cfg.data?.enabled ?? false;
  const curRecips = recips ?? (cfg.data?.recipients ?? []).join(', ');
  const curDow = dow ?? sched.dayOfWeek ?? 1;
  const curDom = dom ?? sched.dayOfMonth ?? 1;
  const curTime = time ?? `${pad2(sched.hour ?? 8)}:${pad2(sched.minute ?? 0)}`;
  const [th, tm] = curTime.split(':').map(Number);

  const scheduleObj = cadence === 'weekly'
    ? { dayOfWeek: curDow, hour: th, minute: tm }
    : { dayOfMonth: curDom, hour: th, minute: tm };

  const next = cadence === 'weekly' ? nextWeekly(curDow, th, tm) : nextQuarterly(curDom, th, tm);
  const whenText = cadence === 'weekly'
    ? `every ${DOW[curDow]} at ${fmtClock(th, tm)}`
    : `on the ${ordinal(curDom)} of Jan, Apr, Jul & Oct at ${fmtClock(th, tm)}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-gray-800 capitalize">{cadence} report email</div>
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={curEnabled} onChange={(e) => setEnabled(e.target.checked)} />
          {curEnabled ? 'On' : 'Off'}
        </label>
      </div>
      <p className="text-[12px] text-gray-500 mb-3">{blurb}</p>

      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 mb-3 text-[12px]">
        {curEnabled ? (
          <span className="text-gray-700">
            Sends <strong>{whenText}</strong>
            {next && <> &middot; next: <strong>{fmtWhen(next)}</strong></>}
            <span className="text-gray-400"> (server time)</span>
          </span>
        ) : (
          <span className="text-gray-500">Off &mdash; turn on to send {whenText}.</span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-3">
        <div>
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Send day</label>
          {cadence === 'weekly' ? (
            <select value={curDow} onChange={(e) => setDow(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan">
              {DOW.map((d, i) => (<option key={i} value={i}>{d}</option>))}
            </select>
          ) : (
            <select value={curDom} onChange={(e) => setDom(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (<option key={d} value={d}>{ordinal(d)}</option>))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Send time</label>
          <input type="time" value={curTime} onChange={(e) => setTime(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
        </div>
      </div>

      <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Recipients (comma-separated emails)</label>
      <textarea rows={2} value={curRecips} onChange={(e) => setRecips(e.target.value)}
        placeholder="hiringmanager@lightspeedsystems.com, hr@lightspeedsystems.com"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ls-cyan" />
      <div className="flex items-center gap-3">
        <button
          onClick={() => save.mutate({ cadence, enabled: curEnabled, recipients: curRecips.split(',').map((x) => x.trim()).filter(Boolean), schedule: scheduleObj })}
          disabled={save.isLoading}
          className="px-4 py-2 bg-ls-primary text-white rounded-md text-sm font-semibold hover:bg-ls-primary-600 disabled:opacity-50">
          {save.isLoading ? 'Saving…' : 'Save'}
        </button>
        {save.isSuccess && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </div>
  );
}

const TABS = ['Overview', 'Weekly', 'Quarterly'];

export default function Insights() {
  const [tab, setTab] = useState('Overview');
  const [jdId, setJdId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [qOffset, setQOffset] = useState(1); // default to last completed quarter
  const { data: roles } = trpc.insights.roles.useQuery();

  const range = tab === 'Overview' ? { label: 'All time' } : tab === 'Weekly' ? weekRange(weekOffset) : quarterRange(qOffset);
  const hasRange = tab !== 'Overview';

  const args: any = {};
  if (jdId) args.jdId = jdId;
  if (hasRange) { args.from = (range as any).from; args.to = (range as any).to; }
  const { data, isLoading, error } = trpc.insights.summary.useQuery(Object.keys(args).length ? args : undefined);

  const compareArgs: any = { ...(jdId ? { jdId } : {}), from: (range as any).compareFrom, to: (range as any).compareTo };
  const compare = trpc.insights.summary.useQuery(compareArgs, { enabled: hasRange && !!(range as any).compareFrom });

  const s = data?.summary;
  const cs = hasRange ? compare.data?.summary : null;
  const delta = (v?: number, p?: number) => (typeof v === 'number' && typeof p === 'number' ? v - p : null);
  const roleTitle = jdId ? ((roles ?? []).find((r) => r.jdId === jdId)?.title ?? 'Role') : null;

  return (
    <div className="space-y-5">
      {/* ── Navy hero: title, filter, tabs, KPI tiles ── */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: 'radial-gradient(120% 140% at 85% 0%, #123056 0%, #0B1D40 55%)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-extrabold">Metrics</h1>
            <p className="text-sm text-white/60 mt-1">{roleTitle ? `${roleTitle} — pipeline analytics` : 'All roles — hiring pipeline analytics'}</p>
          </div>
          <select value={jdId ?? ''} onChange={(e) => setJdId(e.target.value || null)}
            className="w-60 px-3 py-2 rounded-lg text-sm bg-white text-gray-800 border border-white/20 focus:outline-none focus:ring-2 focus:ring-ls-cyan">
            <option value="">All roles (overall)</option>
            {(roles ?? []).map((r) => (<option key={r.jdId} value={r.jdId}>{r.title} ({r.count})</option>))}
          </select>
        </div>

        <div className="inline-flex gap-1 p-1 rounded-xl bg-white/[.07] mb-5">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? 'bg-white text-ls-ink shadow' : 'text-white/70 hover:text-white'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {isLoading || !data || !s ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[92px] rounded-xl bg-white/[.06] border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile label="Applicants" value={s.totalApplicants} delta={delta(s.totalApplicants, cs?.totalApplicants)} sub={hasRange ? (range as any).label : 'all time'} />
            <KpiTile label="Offered" value={s.totalOffered} delta={delta(s.totalOffered, cs?.totalOffered)} sub={`${s.offerRate}% offer rate`} />
            <KpiTile label="Hired" value={s.totalHired} delta={delta(s.totalHired, cs?.totalHired)} sub={`${s.hireRate}% hire rate`} />
            <KpiTile label="Avg CCAT" value={data.ccat ? data.ccat.avg : '—'} unit={data.ccat ? '/50' : ''} sub={data.ccat ? `${Math.round((data.ccat.passed / data.ccat.total) * 100)}% pass` : 'no scores'} />
            <KpiTile label="Avg EPP" value={data.epp ? `${data.epp.avg}%` : '—'} sub={data.epp ? `${Math.round((data.epp.passed / data.epp.total) * 100)}% pass` : 'no scores'} />
            <KpiTile label="Time to hire" value={data.timeToHire?.medianDays != null ? data.timeToHire.medianDays : '—'} unit={data.timeToHire?.medianDays != null ? 'd' : ''} sub={data.timeToHire ? `median · ${data.timeToHire.hired} hired` : 'no hires yet'} />
          </div>
        )}
      </div>

      {/* ── Period selector for Weekly / Quarterly ── */}
      {tab === 'Weekly' && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Week:</label>
          <select value={weekOffset} onChange={(e) => setWeekOffset(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white">
            <option value={0}>This week</option>
            <option value={1}>Last week</option>
            <option value={2}>2 weeks ago</option>
            <option value={3}>3 weeks ago</option>
          </select>
          <span className="text-xs text-gray-400">vs prior week</span>
        </div>
      )}
      {tab === 'Quarterly' && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Quarter:</label>
          <select value={qOffset} onChange={(e) => setQOffset(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white">
            <option value={0}>{quarterRange(0).label} (in progress)</option>
            <option value={1}>{quarterRange(1).label}</option>
            <option value={2}>{quarterRange(2).label}</option>
            <option value={3}>{quarterRange(3).label}</option>
            <option value={4}>{quarterRange(4).label}</option>
          </select>
          <span className="text-xs text-gray-400">vs {quarterRange(qOffset + 1).label}</span>
        </div>
      )}

      {/* ── Charts ── */}
      {error || !data ? (
        <div className="flex items-center justify-center h-48 text-sm text-red-400">Failed to load metrics.</div>
      ) : (
        <Charts data={data} />
      )}

      {tab === 'Weekly' && (
        <div className="max-w-2xl">
          <ScheduleCard cadence="weekly" blurb="A bite-sized weekly digest — new applicants, pipeline movement, interviews, offers, hires. Good for hiring managers." />
        </div>
      )}
      {tab === 'Quarterly' && (
        <div className="max-w-2xl">
          <ScheduleCard cadence="quarterly" blurb="A quarterly summary for leadership — the same metrics rolled up per quarter with prior-quarter comparison." />
        </div>
      )}
    </div>
  );
}
