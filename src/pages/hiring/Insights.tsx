// ============================================================
// METRICS PAGE — hiring pipeline analytics.
// Sub-tabs: Overview (all-time), Weekly, Quarterly (period reports
// with vs-prior-period deltas), and Schedule (configure the automated
// weekly/quarterly report emails). All views share a per-role filter.
// ============================================================

import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import SubTabs from '../../components/SubTabs';

const STAGE_COLORS: Record<string, string> = {
  Applied:             'bg-purple-500',
  Assessment:          'bg-blue-500',
  'Work Sample':       'bg-indigo-500',
  'Values Review':     'bg-cyan-500',
  'Phone Screen':       'bg-teal-500',
  'Interview Scheduled':'bg-yellow-500',
  Interviewed:         'bg-orange-500',
  Offered:             'bg-emerald-500',
  Hired:               'bg-green-500',
  Rejected:            'bg-red-400',
  'Not Selected':      'bg-gray-400',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900">{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function DeltaStat({ label, value, prev, sub }: { label: string; value: number; prev?: number | null; sub?: string }) {
  const d = typeof prev === 'number' ? value - prev : null;
  const color = d == null ? '' : d > 0 ? 'text-green-600' : d < 0 ? 'text-red-500' : 'text-gray-400';
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {d != null && <span className={`text-xs font-semibold ${color}`}>{d > 0 ? '+' : ''}{d}</span>}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      {d != null && <div className="text-[10px] text-gray-400 mt-0.5">vs prior period</div>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div className="text-sm font-semibold text-gray-700 mb-3">{title}</div>;
}

function BarChart({ rows, maxValue }: { rows: { label: string; value: number; color?: string }[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-36 text-xs text-gray-600 text-right truncate shrink-0">{row.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
            <div className={`h-5 rounded-full transition-all ${row.color ?? 'bg-blue-500'}`}
              style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 4 : 0)}%` }} />
          </div>
          <div className="text-xs font-semibold text-gray-700 w-8 text-right">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function ScoreBadge({ label, value, pass }: { label: string; value: number | null; pass?: boolean }) {
  const color = value === null ? 'text-gray-400' : pass ? 'text-green-600' : 'text-red-500';
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value !== null ? value : '—'}</span>
    </div>
  );
}

// ── Charts body (shared by every view) ─────────────────────
function Charts({ data, volumeTitle }: { data: any; volumeTitle: string }) {
  const { funnel, rejectionReasons, sourceMix, timeInStage, weeklyVolume, ccat, epp, interview } = data;
  const funnelMax = Math.max(...funnel.map((f: any) => f.count), 1);
  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Pipeline funnel" />
          <BarChart rows={funnel.map((f: any) => ({ label: f.stage, value: f.count, color: STAGE_COLORS[f.stage] ?? 'bg-gray-400' }))} maxValue={funnelMax} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Avg days per stage" />
          {timeInStage.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Not enough history yet.</div>
          ) : (
            <BarChart rows={timeInStage.map((t: any) => ({ label: t.stage, value: t.avgDays, color: 'bg-indigo-400' }))} />
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <SectionHeader title={volumeTitle} />
        {weeklyVolume.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">No data yet.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {weeklyVolume.map((w: any) => {
              const max = Math.max(...weeklyVolume.map((x: any) => x.count), 1);
              const pct = Math.max((w.count / max) * 100, w.count > 0 ? 6 : 0);
              return (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-gray-500">{w.count}</div>
                  <div className="w-full bg-blue-400 rounded-t" style={{ height: `${pct}%` }} />
                  <div className="text-[9px] text-gray-400 truncate w-full text-center">{w.week}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Rejection reasons" />
          {rejectionReasons.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No rejections yet.</div>
          ) : (
            <BarChart rows={rejectionReasons.map((r: any) => ({ label: r.reason, value: r.count, color: 'bg-red-400' }))} />
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Application sources" />
          {sourceMix.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No source data yet.</div>
          ) : (
            <BarChart rows={sourceMix.map((s: any) => ({ label: s.source, value: s.count, color: 'bg-cyan-500' }))} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="CCAT scores" />
          {!ccat ? <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div> : (
            <div>
              <ScoreBadge label="Total assessed" value={ccat.total} />
              <ScoreBadge label="Average" value={ccat.avg} />
              <ScoreBadge label="Min" value={ccat.min} />
              <ScoreBadge label="Max" value={ccat.max} />
              <ScoreBadge label="Passed (≥30)" value={ccat.passed} pass={true} />
              <ScoreBadge label="Failed (<30)" value={ccat.failed} pass={false} />
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="EPP values match" />
          {!epp ? <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div> : (
            <div>
              <ScoreBadge label="Total analyzed" value={epp.total} />
              <ScoreBadge label="Average score" value={epp.avg} />
              <ScoreBadge label="Passed (≥70%)" value={epp.passed} pass={true} />
              <ScoreBadge label="Failed (<70%)" value={epp.failed} pass={false} />
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Interview scores" />
          {!interview ? <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div> : (
            <div>
              <ScoreBadge label="Total scored" value={interview.total} />
              <ScoreBadge label="Average score" value={interview.avg} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── One report view for a range (empty range = all-time) ───
function ReportView({ jdId, range, volumeTitle }: {
  jdId: string | null;
  range: { from?: string; to?: string; compareFrom?: string; compareTo?: string };
  volumeTitle: string;
}) {
  const args: any = {};
  if (jdId) args.jdId = jdId;
  if (range.from) args.from = range.from;
  if (range.to) args.to = range.to;
  const hasArgs = Object.keys(args).length > 0;
  const { data, isLoading, error } = trpc.insights.summary.useQuery(hasArgs ? args : undefined);

  const compareArgs: any = { ...(jdId ? { jdId } : {}), from: range.compareFrom, to: range.compareTo };
  const compare = trpc.insights.summary.useQuery(compareArgs, { enabled: !!range.compareFrom });

  if (isLoading) return <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading…</div>;
  if (error || !data) return <div className="flex items-center justify-center h-48 text-sm text-red-400">Failed to load metrics.</div>;

  const s = data.summary;
  const cs = range.compareFrom ? compare.data?.summary : null;
  const { ccat, epp } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <DeltaStat label="Applicants" value={s.totalApplicants} prev={cs?.totalApplicants} />
        <DeltaStat label="Offered" value={s.totalOffered} prev={cs?.totalOffered} sub={`${s.offerRate}% offer rate`} />
        <DeltaStat label="Hired" value={s.totalHired} prev={cs?.totalHired} sub={`${s.hireRate}% hire rate`} />
        <StatCard label="Avg CCAT score" value={ccat ? `${ccat.avg}/50` : '—'} sub={ccat ? `${ccat.passed} passed · ${ccat.failed} failed` : 'No scores yet'} />
        <StatCard label="Avg EPP match" value={epp ? `${epp.avg}%` : '—'} sub={epp ? `${epp.passed} passed · ${epp.failed} failed` : 'No scores yet'} />
      </div>
      <Charts data={data} volumeTitle={volumeTitle} />
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

// ── Schedule + recipients card (shown inside the Weekly / Quarterly tabs) ─────
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
    <div className="bg-white rounded-lg border border-gray-200 p-5">
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

  const wk = weekRange(weekOffset);
  const qr = quarterRange(qOffset);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Metrics</h1>
          <p className="text-sm text-gray-500 mt-1">
            {jdId
              ? `${(roles ?? []).find((r) => r.jdId === jdId)?.title ?? 'Role'} — pipeline analytics`
              : 'All roles — hiring pipeline analytics'}
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Role</label>
          <select value={jdId ?? ''} onChange={(e) => setJdId(e.target.value || null)}
            className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ls-cyan">
            <option value="">All roles (overall)</option>
            {(roles ?? []).map((r) => (<option key={r.jdId} value={r.jdId}>{r.title} ({r.count})</option>))}
          </select>
        </div>
      </div>

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <ReportView jdId={jdId} range={{}} volumeTitle="Weekly application volume (last 12 weeks)" />
      )}

      {tab === 'Weekly' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Week:</label>
            <select value={weekOffset} onChange={(e) => setWeekOffset(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white">
              <option value={0}>This week</option>
              <option value={1}>Last week</option>
              <option value={2}>2 weeks ago</option>
              <option value={3}>3 weeks ago</option>
            </select>
            <span className="text-xs text-gray-400">{wk.label}</span>
          </div>
          <ReportView jdId={jdId} range={wk} volumeTitle="Applications this period (by week)" />
          <div className="max-w-2xl">
            <ScheduleCard cadence="weekly" blurb="A bite-sized weekly digest — new applicants, pipeline movement, interviews, offers, hires. Good for hiring managers." />
          </div>
        </div>
      )}

      {tab === 'Quarterly' && (
        <div className="space-y-4">
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
          <ReportView jdId={jdId} range={qr} volumeTitle="Applications this quarter (by week)" />
          <div className="max-w-2xl">
            <ScheduleCard cadence="quarterly" blurb="A quarterly summary for leadership — the same metrics rolled up per quarter with prior-quarter comparison." />
          </div>
        </div>
      )}

    </div>
  );
}
