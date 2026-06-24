// ============================================================
// TELEMETRY DASHBOARD — RCDO-pattern multi-tab analytics
// Tabs: Pulse | Overview | Trends | Activity Log | Chat Debug
// KPI cards, bar charts, user tables, time window selector
// ============================================================

import { useState, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { ChevronDown, ChevronRight } from 'lucide-react';

type TabType = 'pulse' | 'overview' | 'trends' | 'activity' | 'debug';

// ── Styles ──────────────────────────────────────────────────
const st = {
  container: { maxWidth: 1100 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  tabBar: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 } as React.CSSProperties,
  tab: { padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -2, cursor: 'pointer' } as React.CSSProperties,
  tabActive: { color: '#2563eb', borderBottomColor: '#2563eb' } as React.CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 } as React.CSSProperties,
  kpiCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px' } as React.CSSProperties,
  kpiLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.03em' } as React.CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, color: '#1a1a2e', marginTop: 4 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 16 } as React.CSSProperties,
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  thRight: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  tdRight: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  weekBtn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer' } as React.CSSProperties,
  weekBtnActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb' } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  avatar: { width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#4338ca', marginRight: 8, flexShrink: 0 } as React.CSSProperties,
};

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#84cc16'];
const WEEK_OPTIONS = [1, 2, 4, 8, 12];

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string) {
  return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}

// ── Bar chart (pure CSS, no dependencies) ───────────────────
function BarChart({ data, labelKey, valueKey, maxHeight = 120, color = '#2563eb' }: {
  data: any[];
  labelKey: string;
  valueKey: string;
  maxHeight?: number;
  color?: string;
}) {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: maxHeight }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const height = Math.max((val / max) * maxHeight, 2);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
            <div style={{ width: '100%', height, background: color, borderRadius: '3px 3px 0 0', minWidth: 4 }} title={`${d[labelKey]}: ${val}`} />
            <span style={{ fontSize: 8, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 40 }}>
              {formatDate(d[labelKey])}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Pulse Section ───────────────────────────────────────────
function PulseSection({ weeks }: { weeks: number }) {
  const { data, isLoading } = trpc.telemetry.pulse.useQuery({ weeks });

  if (isLoading) return <p style={{ color: '#9ca3af' }}>Loading pulse data...</p>;
  if (!data || data.days.length === 0) return <p style={st.empty}>No activity data for this period.</p>;

  const s = data.summary;

  return (
    <div>
      <div style={st.kpiRow}>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Avg Daily Users</div>
          <div style={st.kpiValue}>{s.avg_daily_users ?? 0}</div>
        </div>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Peak Daily Users</div>
          <div style={st.kpiValue}>{s.peak_daily_users ?? 0}</div>
        </div>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Unique Users</div>
          <div style={st.kpiValue}>{s.unique_users ?? 0}</div>
        </div>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Total Events</div>
          <div style={st.kpiValue}>{(s.total_events ?? 0).toLocaleString()}</div>
        </div>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Active Days</div>
          <div style={st.kpiValue}>{s.active_days ?? 0}</div>
        </div>
      </div>

      <div style={st.card}>
        <div style={st.cardTitle}>Daily Active Users</div>
        <BarChart data={data.days} labelKey="day" valueKey="active_users" color="#2563eb" />
      </div>

      <div style={st.card}>
        <div style={st.cardTitle}>Daily Events (Page Views + Actions)</div>
        <BarChart data={data.days} labelKey="day" valueKey="total_events" color="#7c3aed" />
      </div>
    </div>
  );
}

// ── Overview Section ────────────────────────────────────────
function OverviewSection({ weeks }: { weeks: number }) {
  const { data, isLoading } = trpc.telemetry.overview.useQuery({ weeks });

  if (isLoading) return <p style={{ color: '#9ca3af' }}>Loading overview...</p>;
  if (!data) return <p style={st.empty}>No data available.</p>;

  return (
    <div>
      <div style={st.kpiRow}>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Active Users</div>
          <div style={st.kpiValue}>{data.activeUsers} <span style={{ fontSize: 13, color: '#6b7280' }}>/ {data.totalUsers}</span></div>
        </div>
        <div style={st.kpiCard}>
          <div style={st.kpiLabel}>Participation Rate</div>
          <div style={{ ...st.kpiValue, color: data.participationRate >= 75 ? '#059669' : data.participationRate >= 50 ? '#d97706' : '#dc2626' }}>
            {data.participationRate}%
          </div>
        </div>
      </div>

      {/* Event breakdown */}
      {data.eventBreakdown.length > 0 && (
        <div style={st.card}>
          <div style={st.cardTitle}>Event Distribution</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.eventBreakdown.map((e: any, i: number) => (
              <span key={e.event_type} style={{ ...st.badge, background: `${COLORS[i % COLORS.length]}15`, color: COLORS[i % COLORS.length] }}>
                {e.event_type}: {Number(e.count).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top users table */}
      {data.topUsers.length > 0 && (
        <div style={st.card}>
          <div style={st.cardTitle}>Top 10 Active Users</div>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>User</th>
                <th style={st.th}>Role</th>
                <th style={st.thRight}>Events</th>
                <th style={st.thRight}>Page Views</th>
                <th style={st.thRight}>Actions</th>
                <th style={st.th}>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((u: any) => (
                <tr key={u.id}>
                  <td style={st.td}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={st.avatar}>{initials(u.name)}</span>
                      <span style={{ fontWeight: 500 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={st.td}>
                    <span style={{ ...st.badge, background: '#f3f4f6', color: '#374151' }}>{u.role}</span>
                  </td>
                  <td style={st.tdRight}>{Number(u.total_events).toLocaleString()}</td>
                  <td style={st.tdRight}>{Number(u.page_views).toLocaleString()}</td>
                  <td style={st.tdRight}>{Number(u.actions).toLocaleString()}</td>
                  <td style={{ ...st.td, fontSize: 12, color: '#6b7280' }}>
                    {new Date(u.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Trends Section ──────────────────────────────────────────
function TrendsSection({ weeks }: { weeks: number }) {
  const { data, isLoading } = trpc.telemetry.trends.useQuery({ weeks: Math.max(weeks, 4) });

  if (isLoading) return <p style={{ color: '#9ca3af' }}>Loading trends...</p>;
  if (!data || data.weeks.length === 0) return <p style={st.empty}>Not enough data for trends yet.</p>;

  return (
    <div>
      <div style={st.card}>
        <div style={st.cardTitle}>Weekly Active Users</div>
        <BarChart data={data.weeks} labelKey="week_start" valueKey="active_users" color="#2563eb" maxHeight={100} />
      </div>
      <div style={st.card}>
        <div style={st.cardTitle}>Weekly Participation %</div>
        <BarChart data={data.weeks} labelKey="week_start" valueKey="participation_pct" color="#059669" maxHeight={100} />
      </div>
      <div style={st.card}>
        <div style={st.cardTitle}>Weekly Event Volume</div>
        <BarChart data={data.weeks} labelKey="week_start" valueKey="total_events" color="#7c3aed" maxHeight={100} />
      </div>

      {/* Data table */}
      <div style={st.card}>
        <div style={st.cardTitle}>Weekly Data</div>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Week</th>
              <th style={st.thRight}>Users</th>
              <th style={st.thRight}>Participation</th>
              <th style={st.thRight}>Events</th>
              <th style={st.thRight}>Page Views</th>
              <th style={st.thRight}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w: any) => (
              <tr key={w.week_start}>
                <td style={st.td}>{formatDate(w.week_start)}</td>
                <td style={st.tdRight}>{w.active_users}</td>
                <td style={st.tdRight}>
                  <span style={{ color: w.participation_pct >= 75 ? '#059669' : w.participation_pct >= 50 ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                    {w.participation_pct}%
                  </span>
                </td>
                <td style={st.tdRight}>{w.total_events.toLocaleString()}</td>
                <td style={st.tdRight}>{w.page_views.toLocaleString()}</td>
                <td style={st.tdRight}>{w.actions.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity Log Section (existing, restyled) ───────────────
function ActivityLogSection() {
  const [selectedEventType, setSelectedEventType] = useState('');
  const { data, isLoading } = trpc.telemetry.activityLog.useQuery(
    selectedEventType ? { eventType: selectedEventType } : undefined
  );
  const { data: stats } = trpc.telemetry.activityStats.useQuery();

  const rows = data?.rows ?? [];

  return (
    <div>
      {/* Event type filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          style={!selectedEventType ? { ...st.weekBtn, ...st.weekBtnActive } : st.weekBtn}
          onClick={() => setSelectedEventType('')}
        >
          All Events {data?.total != null ? `(${data.total})` : ''}
        </button>
        {stats?.map((s: any) => (
          <button
            key={s.eventType}
            style={selectedEventType === s.eventType ? { ...st.weekBtn, ...st.weekBtnActive } : st.weekBtn}
            onClick={() => setSelectedEventType(s.eventType)}
          >
            {s.eventType} ({s.count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: '#9ca3af' }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={st.empty}>No activity log entries found.</p>
      ) : (
        <div style={st.card}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, width: 140 }}>Time</th>
                <th style={st.th}>User</th>
                <th style={{ ...st.th, width: 120 }}>Event Type</th>
                <th style={st.th}>Value</th>
                <th style={st.th}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry: any) => (
                <tr key={entry.id}>
                  <td style={{ ...st.td, fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td style={st.td}>{entry.userName || '—'}</td>
                  <td style={st.td}>
                    <span style={{ ...st.badge, background: '#eff6ff', color: '#2563eb' }}>{entry.eventType}</span>
                  </td>
                  <td style={st.td}>{entry.eventValue || '—'}</td>
                  <td style={{ ...st.td, fontSize: 11, fontFamily: 'monospace', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Chat Debug Section (existing, restyled) ─────────────────
function ChatDebugSection() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { data: sessionsData, isLoading } = trpc.telemetry.debugSessions.useQuery();
  const sessions = sessionsData?.rows ?? [];
  const { data: stats } = trpc.telemetry.debugStats.useQuery();

  return (
    <div>
      {stats && (
        <div style={st.kpiRow}>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Total Sessions</div>
            <div style={st.kpiValue}>{stats.totalSessions}</div>
          </div>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Avg Duration</div>
            <div style={st.kpiValue}>{stats.avgDuration?.toFixed(0) ?? 0}ms</div>
          </div>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Input Tokens</div>
            <div style={st.kpiValue}>{(stats.totalInputTokens ?? 0).toLocaleString()}</div>
          </div>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Output Tokens</div>
            <div style={st.kpiValue}>{(stats.totalOutputTokens ?? 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#9ca3af' }}>Loading...</p>
      ) : sessions.length === 0 ? (
        <p style={st.empty}>No debug sessions found.</p>
      ) : (
        <div style={st.card}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, width: 30 }}></th>
                <th style={{ ...st.th, width: 140 }}>Time</th>
                <th style={st.th}>User</th>
                <th style={st.thRight}>In Tokens</th>
                <th style={st.thRight}>Out Tokens</th>
                <th style={st.thRight}>Tool Calls</th>
                <th style={st.thRight}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s: any, idx: number) => (
                <>
                  <tr key={s.id} onClick={() => setExpandedRow(expandedRow === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                    <td style={st.td}>
                      {expandedRow === s.id ? <ChevronDown size={14} color="#6b7280" /> : <ChevronRight size={14} color="#6b7280" />}
                    </td>
                    <td style={{ ...st.td, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td style={st.td}>{s.userName || '—'}</td>
                    <td style={st.tdRight}>{s.inputTokens?.toLocaleString() ?? '—'}</td>
                    <td style={st.tdRight}>{s.outputTokens?.toLocaleString() ?? '—'}</td>
                    <td style={st.tdRight}>{s.toolCalls ?? '—'}</td>
                    <td style={st.tdRight}>{s.durationMs ? `${s.durationMs}ms` : '—'}</td>
                  </tr>
                  {expandedRow === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={7} style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <pre style={{ fontSize: 11, fontFamily: 'monospace', color: '#374151', margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify({ sessionId: s.sessionId, promptTemplateId: s.promptTemplateId, inputTokens: s.inputTokens, outputTokens: s.outputTokens, toolCalls: s.toolCalls, loopCount: s.loopCount, durationMs: s.durationMs }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────
export default function TelemetryPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('pulse');
  const [weeks, setWeeks] = useState(4);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'pulse', label: 'Pulse' },
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'debug', label: 'Chat Debug' },
  ];

  const showWeekSelector = ['pulse', 'overview', 'trends'].includes(activeTab);

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <h3 style={st.title}>Telemetry Dashboard</h3>
          <p style={st.subtitle}>Platform activity, user engagement, and usage trends</p>
        </div>
      </div>

      {/* Week selector + tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 0 }}>
        <div style={st.tabBar}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={activeTab === t.id ? { ...st.tab, ...st.tabActive } : st.tab}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {showWeekSelector && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {WEEK_OPTIONS.map(w => (
              <button
                key={w}
                style={weeks === w ? { ...st.weekBtn, ...st.weekBtnActive } : st.weekBtn}
                onClick={() => setWeeks(w)}
              >
                {w}w
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div style={{ marginTop: 16 }}>
        {activeTab === 'pulse' && <PulseSection weeks={weeks} />}
        {activeTab === 'overview' && <OverviewSection weeks={weeks} />}
        {activeTab === 'trends' && <TrendsSection weeks={weeks} />}
        {activeTab === 'activity' && <ActivityLogSection />}
        {activeTab === 'debug' && <ChatDebugSection />}
      </div>
    </div>
  );
}
