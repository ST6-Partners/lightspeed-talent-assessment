// ============================================================
// INSIGHTS PAGE — Hiring pipeline analytics
// Pulls from insightsRouter.summary (one query, full payload)
// ============================================================

import { trpc } from '../../lib/trpc';

const STAGE_COLORS: Record<string, string> = {
  Applied:             'bg-purple-500',
  Assessment:          'bg-blue-500',
  'Work Sample':       'bg-indigo-500',
  'Values Review':     'bg-cyan-500',
  'Interview Scheduled':'bg-yellow-500',
  Interviewed:         'bg-orange-500',
  Offered:             'bg-emerald-500',
  Hired:               'bg-green-500',
  Rejected:            'bg-red-400',
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="text-sm font-semibold text-gray-700 mb-3">{title}</div>
  );
}

function BarChart({ rows, maxValue }: { rows: { label: string; value: number; color?: string }[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-36 text-xs text-gray-600 text-right truncate shrink-0">{row.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
            <div
              className={`h-5 rounded-full transition-all ${row.color ?? 'bg-blue-500'}`}
              style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 4 : 0)}%` }}
            />
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

export default function Insights() {
  const { data, isLoading, error } = trpc.insights.summary.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading insights...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-red-400">
        Failed to load insights.
      </div>
    );
  }

  const { funnel, rejectionReasons, sourceMix, timeInStage, weeklyVolume, ccat, epp, interview, summary, conversions } = data;

  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
        <p className="text-sm text-gray-500 mt-1">Hiring pipeline analytics</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total applicants" value={summary.totalApplicants} />
        <StatCard label="Offered" value={summary.totalOffered} sub={`${summary.offerRate}% offer rate`} />
        <StatCard label="Hired" value={summary.totalHired} sub={`${summary.hireRate}% hire rate`} />
        <StatCard
          label="Avg CCAT score"
          value={ccat ? `${ccat.avg}/50` : '—'}
          sub={ccat ? `${ccat.passed} passed · ${ccat.failed} failed` : 'No scores yet'}
        />
        <StatCard
          label="Avg EPP match"
          value={epp ? `${epp.avg}%` : '—'}
          sub={epp ? `${epp.passed} passed · ${epp.failed} failed` : 'No scores yet'}
        />
      </div>

      {/* Funnel + Time in Stage */}
      <div className="grid grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Pipeline funnel" />
          <BarChart
            rows={funnel.map((f) => ({
              label: f.stage,
              value: f.count,
              color: STAGE_COLORS[f.stage] ?? 'bg-gray-400',
            }))}
            maxValue={funnelMax}
          />
        </div>

        {/* Time in Stage */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Avg days per stage" />
          {timeInStage.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Not enough history yet.</div>
          ) : (
            <BarChart
              rows={timeInStage.map((t) => ({
                label: t.stage,
                value: t.avgDays,
                color: 'bg-indigo-400',
              }))}
            />
          )}
        </div>
      </div>

      {/* Weekly Volume */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <SectionHeader title="Weekly application volume (last 12 weeks)" />
        {weeklyVolume.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">No data yet.</div>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {weeklyVolume.map((w) => {
              const max = Math.max(...weeklyVolume.map((x) => x.count), 1);
              const pct = Math.max((w.count / max) * 100, w.count > 0 ? 6 : 0);
              return (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-gray-500">{w.count}</div>
                  <div
                    className="w-full bg-blue-400 rounded-t"
                    style={{ height: `${pct}%` }}
                  />
                  <div className="text-[9px] text-gray-400 rotate-0 truncate w-full text-center">{w.week}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rejection Reasons + Source Mix */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Rejection reasons" />
          {rejectionReasons.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No rejections yet.</div>
          ) : (
            <BarChart
              rows={rejectionReasons.map((r) => ({
                label: r.reason,
                value: r.count,
                color: 'bg-red-400',
              }))}
            />
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Application sources" />
          {sourceMix.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No source data yet.</div>
          ) : (
            <BarChart
              rows={sourceMix.map((s) => ({
                label: s.source,
                value: s.count,
                color: 'bg-cyan-500',
              }))}
            />
          )}
        </div>
      </div>

      {/* Assessment + Interview stats */}
      <div className="grid grid-cols-3 gap-6">
        {/* CCAT */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="CCAT scores" />
          {!ccat ? (
            <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div>
          ) : (
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

        {/* EPP */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="EPP values match" />
          {!epp ? (
            <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div>
          ) : (
            <div>
              <ScoreBadge label="Total analyzed" value={epp.total} />
              <ScoreBadge label="Average score" value={epp.avg} />
              <ScoreBadge label="Passed (≥70%)" value={epp.passed} pass={true} />
              <ScoreBadge label="Failed (<70%)" value={epp.failed} pass={false} />
            </div>
          )}
        </div>

        {/* Interview */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <SectionHeader title="Interview scores" />
          {!interview ? (
            <div className="text-sm text-gray-400 py-4 text-center">No scores on record.</div>
          ) : (
            <div>
              <ScoreBadge label="Total scored" value={interview.total} />
              <ScoreBadge label="Average score" value={interview.avg} />
            </div>
          )}
        </div>
      </div>

      {/* Stage conversion table */}
      {conversions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Stage transitions</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {conversions
                .sort((a, b) => b.count - a.count)
                .map((c, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
                    <td className="px-4 py-2 text-gray-600">{c.from ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{c.to}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">{c.count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
