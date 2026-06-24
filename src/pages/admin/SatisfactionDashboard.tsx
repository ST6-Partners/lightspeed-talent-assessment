// ============================================================
// SATISFACTION DASHBOARD — Reactions + Sentiment Mining (RCDO pattern)
// Pattern: RCDO SatisfactionDashboard in AdminSettings.jsx
// Two sub-tabs: Reactions (explicit 👍/👎) and Sentiment Mining (regex passive)
// ============================================================

import { useState } from 'react';
import { trpc } from '../../lib/trpc';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Styles (matches RCDO inline patterns) ───────────────────
const st = {
  container: { maxWidth: 1100 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  tabBar: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 } as React.CSSProperties,
  tab: { padding: '10px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -2, cursor: 'pointer', transition: 'color 0.15s' } as React.CSSProperties,
  tabActive: { color: '#2563eb', borderBottomColor: '#2563eb' } as React.CSSProperties,
  timeRow: { display: 'flex', gap: 6, marginBottom: 20 } as React.CSSProperties,
  timePill: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  timePillActive: { background: '#1e40af', color: '#fff', borderColor: '#1e40af' } as React.CSSProperties,
  kpiRow: { display: 'flex', gap: 16, marginBottom: 24 } as React.CSSProperties,
  kpiCard: { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px' } as React.CSSProperties,
  kpiValue: { fontSize: 28, fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.1 } as React.CSSProperties,
  kpiLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.03em', marginTop: 4 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20 } as React.CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#1a1a2e', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  thCenter: { textAlign: 'center' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  tdCenter: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' as const } as React.CSSProperties,
  initials: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 14, background: '#e0e7ff', color: '#3730a3', fontSize: 11, fontWeight: 700, marginRight: 8 } as React.CSSProperties,
  userCell: { display: 'flex', alignItems: 'center' } as React.CSSProperties,
  barContainer: { height: 18, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden', position: 'relative' as const } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  signalCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 12 } as React.CSSProperties,
  signalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } as React.CSSProperties,
  signalLabel: { fontSize: 14, fontWeight: 700, color: '#111827' } as React.CSSProperties,
  signalCount: { fontSize: 20, fontWeight: 700 } as React.CSSProperties,
  signalWeight: { fontSize: 11, color: '#9ca3af', fontWeight: 500 } as React.CSSProperties,
  sampleList: { listStyle: 'none', margin: 0, padding: 0 } as React.CSSProperties,
  sampleItem: { padding: '8px 0', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#4b5563', lineHeight: 1.5 } as React.CSSProperties,
  sampleMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 } as React.CSSProperties,
};

const TIME_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
];

const SIGNAL_COLORS: Record<string, string> = {
  gratitude: '#059669',
  confirmation: '#2563eb',
  praise: '#7c3aed',
  success: '#d97706',
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

// ── Reactions sub-tab ───────────────────────────────────────
function ReactionsTab({ days }: { days: number }) {
  const { data, isLoading } = trpc.telemetry.satisfaction.useQuery({ days });

  if (isLoading) return <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading reactions...</p>;
  if (!data) return <p style={st.empty}>No reaction data available.</p>;

  const { summary, byUser, daily } = data;
  const maxDaily = Math.max(...daily.map((d: any) => (parseInt(d.thumbs_up) || 0) + (parseInt(d.thumbs_down) || 0)), 1);

  return (
    <div>
      {/* KPI cards */}
      <div style={st.kpiRow}>
        <div style={st.kpiCard}>
          <p style={{ ...st.kpiValue, color: '#059669' }}>{summary.thumbsUp}</p>
          <p style={st.kpiLabel}>Thumbs Up</p>
        </div>
        <div style={st.kpiCard}>
          <p style={{ ...st.kpiValue, color: '#dc2626' }}>{summary.thumbsDown}</p>
          <p style={st.kpiLabel}>Thumbs Down</p>
        </div>
        <div style={st.kpiCard}>
          <p style={st.kpiValue}>{summary.totalReactions}</p>
          <p style={st.kpiLabel}>Total Reactions</p>
        </div>
        <div style={st.kpiCard}>
          <p style={{ ...st.kpiValue, color: summary.satisfactionRate >= 70 ? '#059669' : summary.satisfactionRate >= 40 ? '#d97706' : '#dc2626' }}>
            {summary.satisfactionRate}%
          </p>
          <p style={st.kpiLabel}>Satisfaction Rate</p>
        </div>
      </div>

      {/* Daily trend chart */}
      {daily.length > 0 && (
        <div style={st.card}>
          <div style={st.cardTitle}>Daily Reactions</div>
          <div style={{ padding: '16px 16px 8px' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 100 }}>
              {daily.map((d: any, i: number) => {
                const up = parseInt(d.thumbs_up) || 0;
                const down = parseInt(d.thumbs_down) || 0;
                const total = up + down;
                const h = (total / maxDaily) * 100;
                const upPct = total > 0 ? (up / total) * 100 : 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${d.day}: ${up} up, ${down} down`}>
                    <div style={{ width: '100%', maxWidth: 24, height: `${h}%`, minHeight: total > 0 ? 4 : 0, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ flex: upPct, background: '#059669' }} />
                      <div style={{ flex: 100 - upPct, background: '#fca5a5' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#9ca3af' }}>
              <span>{daily[0]?.day?.substring(5)}</span>
              <span>{daily[daily.length - 1]?.day?.substring(5)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top users by reactions */}
      {byUser.length > 0 && (
        <div style={st.card}>
          <div style={st.cardTitle}>Top Users by Reactions</div>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>User</th>
                <th style={st.thCenter}>👍</th>
                <th style={st.thCenter}>👎</th>
                <th style={st.thCenter}>Total</th>
                <th style={{ ...st.th, width: 200 }}>Ratio</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((u: any) => {
                const up = parseInt(u.thumbs_up) || 0;
                const total = parseInt(u.total_reactions) || 1;
                const pct = Math.round((up / total) * 100);
                return (
                  <tr key={u.id}>
                    <td style={st.td}>
                      <div style={st.userCell}>
                        <span style={st.initials}>{getInitials(u.name)}</span>
                        <span style={{ fontWeight: 500 }}>{u.name || u.email}</span>
                      </div>
                    </td>
                    <td style={{ ...st.tdCenter, color: '#059669', fontWeight: 600 }}>{u.thumbs_up}</td>
                    <td style={{ ...st.tdCenter, color: '#dc2626', fontWeight: 600 }}>{u.thumbs_down}</td>
                    <td style={{ ...st.tdCenter, fontWeight: 600 }}>{u.total_reactions}</td>
                    <td style={st.td}>
                      <div style={st.barContainer}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: '#059669', borderRadius: 4, transition: 'width 0.3s' }} />
                        <div style={{ position: 'absolute', top: 0, left: `${pct}%`, height: '100%', width: `${100 - pct}%`, background: '#fca5a5', borderRadius: '0 4px 4px 0' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary.totalReactions === 0 && (
        <p style={st.empty}>No reactions recorded yet. Reactions appear when users give thumbs up/down on chat responses.</p>
      )}
    </div>
  );
}

// ── Sentiment Mining sub-tab ────────────────────────────────
function SentimentTab({ days }: { days: number }) {
  const { data, isLoading } = trpc.telemetry.sentiment.useQuery({ days });

  if (isLoading) return <p style={{ color: '#9ca3af', fontSize: 13 }}>Analyzing sentiment...</p>;
  if (!data) return <p style={st.empty}>No sentiment data available.</p>;

  const { summary, signals, samples } = data;

  return (
    <div>
      {/* KPI cards */}
      <div style={st.kpiRow}>
        <div style={st.kpiCard}>
          <p style={st.kpiValue}>{summary.messagesAnalyzed}</p>
          <p style={st.kpiLabel}>Messages Analyzed</p>
        </div>
        <div style={st.kpiCard}>
          <p style={{ ...st.kpiValue, color: '#2563eb' }}>{summary.totalScore}</p>
          <p style={st.kpiLabel}>Total Score</p>
        </div>
        <div style={st.kpiCard}>
          <p style={st.kpiValue}>{summary.avgScore}</p>
          <p style={st.kpiLabel}>Avg Score / Message</p>
        </div>
        <div style={st.kpiCard}>
          <p style={{ ...st.kpiValue, color: summary.positiveRate >= 50 ? '#059669' : '#d97706' }}>
            {summary.positiveRate}%
          </p>
          <p style={st.kpiLabel}>Positive Signal Rate</p>
        </div>
      </div>

      {/* Signal breakdown cards */}
      {signals.map((signal: any) => {
        const color = SIGNAL_COLORS[signal.key] || '#374151';
        const signalSamples = samples.filter((s: any) => s.signal === signal.key);
        return (
          <div key={signal.key} style={st.signalCard}>
            <div style={st.signalHeader}>
              <div>
                <span style={{ ...st.signalLabel, color }}>{signal.label}</span>
                <span style={st.signalWeight}> — weight {signal.weight}x</span>
              </div>
              <span style={{ ...st.signalCount, color }}>{signal.count}</span>
            </div>

            {/* Progress bar relative to messages analyzed */}
            {summary.messagesAnalyzed > 0 && (
              <div style={{ ...st.barContainer, marginBottom: 8, height: 6 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${Math.min((signal.count / summary.messagesAnalyzed) * 100, 100)}%`,
                  background: color, borderRadius: 4,
                }} />
              </div>
            )}

            {/* Sample messages */}
            {signalSamples.length > 0 && (
              <ul style={st.sampleList}>
                {signalSamples.map((s: any) => (
                  <li key={s.id} style={st.sampleItem}>
                    <div>"{s.text}"</div>
                    <div style={st.sampleMeta}>
                      {s.userName} · {s.screenMode} · {formatDate(s.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {signalSamples.length === 0 && (
              <p style={{ fontSize: 12, color: '#d1d5db', margin: '4px 0 0' }}>No matches found in this time window.</p>
            )}
          </div>
        );
      })}

      {summary.messagesAnalyzed === 0 && (
        <p style={st.empty}>No chat sessions to analyze. Sentiment mining runs on initial prompts from chat sessions.</p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function SatisfactionDashboard() {
  const [subTab, setSubTab] = useState<'reactions' | 'sentiment'>('reactions');
  const [days, setDays] = useState(30);

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <h3 style={st.title}>Satisfaction</h3>
          <p style={st.subtitle}>User reactions and passive sentiment signals</p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={st.tabBar}>
        <button
          style={subTab === 'reactions' ? { ...st.tab, ...st.tabActive } : st.tab}
          onClick={() => setSubTab('reactions')}
        >
          Reactions
        </button>
        <button
          style={subTab === 'sentiment' ? { ...st.tab, ...st.tabActive } : st.tab}
          onClick={() => setSubTab('sentiment')}
        >
          Sentiment Mining
        </button>
      </div>

      {/* Time range selector */}
      <div style={st.timeRow}>
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            style={days === opt.days ? { ...st.timePill, ...st.timePillActive } : st.timePill}
            onClick={() => setDays(opt.days)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'reactions' ? (
        <ReactionsTab days={days} />
      ) : (
        <SentimentTab days={days} />
      )}
    </div>
  );
}
