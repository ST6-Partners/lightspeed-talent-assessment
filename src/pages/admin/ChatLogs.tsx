// ============================================================
// CHAT LOGS — View initial prompts per chat session (RCDO pattern)
// Pattern: RCDO ChatLogs in AdminSettings.jsx
// Displays user chat session starts with screen context + filtering
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  filterRow: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 16 } as React.CSSProperties,
  pill: { padding: '5px 14px', fontSize: 12, fontWeight: 500, borderRadius: 16, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', transition: 'all 0.15s' } as React.CSSProperties,
  pillActive: { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' as const } as React.CSSProperties,
  promptCell: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', maxWidth: 500, verticalAlign: 'top' as const } as React.CSSProperties,
  promptText: { fontSize: 13, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } as React.CSSProperties,
  pageBtn: { padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' } as React.CSSProperties,
  pageInfo: { fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  initials: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 14, background: '#e0e7ff', color: '#3730a3', fontSize: 11, fontWeight: 700, marginRight: 8 } as React.CSSProperties,
  userCell: { display: 'flex', alignItems: 'center' } as React.CSSProperties,
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

export default function ChatLogs() {
  const [page, setPage] = useState(1);
  const [screenMode, setScreenMode] = useState<string | undefined>(undefined);
  const limit = 30;

  const { data, isLoading } = trpc.telemetry.chatLogs.useQuery({
    page,
    limit,
    screenMode,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <h3 style={st.title}>Chat Logs</h3>
          <p style={st.subtitle}>Initial prompts per chat session with screen context</p>
        </div>
        <span style={st.pageInfo}>{data?.total ?? 0} total sessions</span>
      </div>

      {/* Screen mode filter pills */}
      {data?.modes && data.modes.length > 0 && (
        <div style={st.filterRow}>
          <button
            style={!screenMode ? { ...st.pill, ...st.pillActive } : st.pill}
            onClick={() => { setScreenMode(undefined); setPage(1); }}
          >
            All
          </button>
          {data.modes.map((mode) => (
            <button
              key={mode}
              style={screenMode === mode ? { ...st.pill, ...st.pillActive } : st.pill}
              onClick={() => { setScreenMode(mode); setPage(1); }}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</p>
      ) : !data || data.rows.length === 0 ? (
        <p style={st.empty}>
          No chat sessions recorded yet. Chat logs appear when users start conversations.
        </p>
      ) : (
        <>
          <div style={st.card}>
            <table style={st.table}>
              <thead>
                <tr>
                  <th style={{ ...st.th, width: 160 }}>User</th>
                  <th style={{ ...st.th, width: 110 }}>Screen</th>
                  <th style={st.th}>Initial Prompt</th>
                  <th style={{ ...st.th, width: 160 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: any) => (
                  <tr key={row.id}>
                    <td style={st.td}>
                      <div style={st.userCell}>
                        <span style={st.initials}>{getInitials(row.userName)}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{row.userName || 'Unknown'}</span>
                      </div>
                    </td>
                    <td style={st.td}>
                      {row.screenMode ? (
                        <span style={st.badge}>{row.screenMode}</span>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                      )}
                      {row.screenTab && (
                        <span style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {row.screenTab}
                        </span>
                      )}
                    </td>
                    <td style={st.promptCell}>
                      <div style={st.promptText}>
                        {row.initialPrompt.length > 300
                          ? row.initialPrompt.substring(0, 300) + '...'
                          : row.initialPrompt}
                      </div>
                    </td>
                    <td style={{ ...st.td, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {formatDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={st.pagination}>
              <button
                style={page <= 1 ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span style={st.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button
                style={page >= totalPages ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
