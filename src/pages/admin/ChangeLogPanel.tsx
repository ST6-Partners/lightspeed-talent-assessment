// ============================================================
// CHANGE LOG PANEL — immutable audit trail with batch view (RCDO pattern)
// Pattern: RCDO ChangeLog with individual + batch views
// Two view modes: Individual (field-level changes) and Batches
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
  tabBar: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 } as React.CSSProperties,
  tab: { padding: '10px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -2, cursor: 'pointer', transition: 'color 0.15s' } as React.CSSProperties,
  tabActive: { color: '#2563eb', borderBottomColor: '#2563eb' } as React.CSSProperties,
  statsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16 } as React.CSSProperties,
  statBadge: { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600 } as React.CSSProperties,
  filterCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', marginBottom: 16 } as React.CSSProperties,
  filterTitle: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 } as React.CSSProperties,
  filterLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 } as React.CSSProperties,
  filterInput: { width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  filterSelect: { width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', background: '#fff', boxSizing: 'border-box' as const } as React.CSSProperties,
  clearBtn: { padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#374151', cursor: 'pointer', alignSelf: 'flex-end' } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  tdMono: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', fontSize: 12 } as React.CSSProperties,
  tdTruncate: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  actionBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' } as React.CSSProperties,
  pageBtn: { padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  pageBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' } as React.CSSProperties,
  pageInfo: { fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  // Batch cards
  batchCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' } as React.CSSProperties,
  batchHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' } as React.CSSProperties,
  batchName: { fontSize: 14, fontWeight: 600, color: '#111827' } as React.CSSProperties,
  batchMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 } as React.CSSProperties,
  batchCount: { fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#dbeafe', padding: '2px 10px', borderRadius: 10 } as React.CSSProperties,
  sourceBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, marginLeft: 8 } as React.CSSProperties,
};

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  create: { bg: '#dcfce7', text: '#166534' },
  CREATE: { bg: '#dcfce7', text: '#166534' },
  update: { bg: '#dbeafe', text: '#1d4ed8' },
  UPDATE: { bg: '#dbeafe', text: '#1d4ed8' },
  delete: { bg: '#fef2f2', text: '#991b1b' },
  DELETE: { bg: '#fef2f2', text: '#991b1b' },
  archive: { bg: '#fef2f2', text: '#991b1b' },
  ARCHIVE: { bg: '#fef2f2', text: '#991b1b' },
  restore: { bg: '#f3e8ff', text: '#6b21a8' },
  RESTORE: { bg: '#f3e8ff', text: '#6b21a8' },
};

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  claude_batch: { bg: '#e0e7ff', text: '#3730a3' },
  csv_import: { bg: '#fef3c7', text: '#92400e' },
  manual: { bg: '#f3f4f6', text: '#374151' },
  batch_auto: { bg: '#dbeafe', text: '#1d4ed8' },
};

// ── Individual view ─────────────────────────────────────────
function IndividualView() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const limit = 30;

  const { data: logs, isLoading } = trpc.changelog.list.useQuery({
    page, limit,
    userId: userId || undefined,
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  const { data: stats } = trpc.changelog.stats.useQuery();
  const { data: users } = trpc.auth.listUsers.useQuery();

  const activeUsers = users?.filter((u: any) => u.isActive) || [];
  const totalPages = logs ? Math.ceil(logs.total / limit) : 0;

  const clearFilters = () => { setUserId(''); setEntityType(''); setStartDate(''); setEndDate(''); setPage(1); };

  return (
    <div>
      {/* Stats badges */}
      {stats && stats.length > 0 && (
        <div style={st.statsRow}>
          {stats.map((s: any) => {
            const c = ACTION_COLORS[s.action] || { bg: '#f3f4f6', text: '#374151' };
            return (
              <span key={s.action} style={{ ...st.statBadge, background: c.bg, color: c.text }}>
                {s.action}: {s.count}
              </span>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div style={st.filterCard}>
        <div style={st.filterTitle}>Filters</div>
        <div style={st.filterGrid}>
          <div>
            <label style={st.filterLabel}>User</label>
            <select style={st.filterSelect} value={userId} onChange={e => { setUserId(e.target.value); setPage(1); }}>
              <option value="">All Users</option>
              {activeUsers.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={st.filterLabel}>Entity Type</label>
            <input style={st.filterInput} value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} placeholder="e.g. sample_entities" />
          </div>
          <div>
            <label style={st.filterLabel}>Start Date</label>
            <input type="date" style={st.filterInput} value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label style={st.filterLabel}>End Date</label>
            <input type="date" style={st.filterInput} value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button style={st.clearBtn} onClick={clearFilters}>Clear</button>
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{logs?.total ?? 0} total entries</div>

      {/* Table */}
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</p>
      ) : !logs || logs.rows.length === 0 ? (
        <p style={st.empty}>No change log entries found.</p>
      ) : (
        <>
          <div style={st.card}>
            <table style={st.table}>
              <thead>
                <tr>
                  <th style={{ ...st.th, width: 150 }}>Timestamp</th>
                  <th style={{ ...st.th, width: 120 }}>User</th>
                  <th style={{ ...st.th, width: 80 }}>Action</th>
                  <th style={{ ...st.th, width: 120 }}>Entity Type</th>
                  <th style={{ ...st.th, width: 100 }}>Field</th>
                  <th style={st.th}>Old Value</th>
                  <th style={st.th}>New Value</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((entry: any, idx: number) => {
                  const c = ACTION_COLORS[entry.action] || { bg: '#f3f4f6', text: '#374151' };
                  return (
                    <tr key={idx}>
                      <td style={{ ...st.td, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(entry.createdAt)}</td>
                      <td style={{ ...st.td, fontWeight: 500 }}>{entry.userName || '—'}</td>
                      <td style={st.td}>
                        <span style={{ ...st.actionBadge, background: c.bg, color: c.text }}>{entry.action}</span>
                      </td>
                      <td style={st.tdMono}>{entry.entityType || '—'}</td>
                      <td style={st.tdMono}>{entry.field || '—'}</td>
                      <td style={st.tdTruncate} title={entry.oldValue || ''}>{entry.oldValue || '—'}</td>
                      <td style={st.tdTruncate} title={entry.newValue || ''}>{entry.newValue || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={st.pagination}>
              <button style={page <= 1 ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span style={st.pageInfo}>Page {page} of {totalPages}</span>
              <button style={page >= totalPages ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Batch view ──────────────────────────────────────────────
function BatchView() {
  const [page, setPage] = useState(1);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading } = trpc.changelog.batches.useQuery({ page, limit });
  const { data: detail } = trpc.changelog.batchDetail.useQuery(
    { batchId: expandedBatch! },
    { enabled: !!expandedBatch }
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div>
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading batches...</p>
      ) : !data || data.batches.length === 0 ? (
        <p style={st.empty}>
          No change batches recorded. Batches are created when related changes are grouped
          (e.g., Claude-proposed changes, CSV imports, or manual batch edits).
        </p>
      ) : (
        <>
          {data.batches.map((batch: any) => {
            const isExpanded = expandedBatch === batch.id;
            const sc = SOURCE_COLORS[batch.sourceType] || SOURCE_COLORS.manual;
            return (
              <div key={batch.id} style={st.batchCard}>
                <div
                  style={st.batchHeader}
                  onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={st.batchName}>{batch.name || 'Unnamed Batch'}</span>
                      <span style={{ ...st.sourceBadge, background: sc.bg, color: sc.text }}>{batch.sourceType}</span>
                    </div>
                    <div style={st.batchMeta}>
                      By {batch.createdByName || 'Unknown'} · {formatDate(batch.createdAt)} · Status: {batch.status}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={st.batchCount}>{batch.changeCount} changes</span>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && detail && detail.changes && (
                  <div style={{ padding: '0 16px 12px', maxHeight: 400, overflow: 'auto' }}>
                    <table style={{ ...st.table, marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th style={{ ...st.th, width: 80 }}>Action</th>
                          <th style={st.th}>Entity Type</th>
                          <th style={st.th}>Field</th>
                          <th style={st.th}>Old Value</th>
                          <th style={st.th}>New Value</th>
                          <th style={{ ...st.th, width: 100 }}>User</th>
                          <th style={{ ...st.th, width: 140 }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.changes.map((c: any, i: number) => {
                          const ac = ACTION_COLORS[c.action] || { bg: '#f3f4f6', text: '#374151' };
                          return (
                            <tr key={i}>
                              <td style={st.td}>
                                <span style={{ ...st.actionBadge, background: ac.bg, color: ac.text }}>{c.action}</span>
                              </td>
                              <td style={st.tdMono}>{c.entityType || '—'}</td>
                              <td style={st.tdMono}>{c.field || '—'}</td>
                              <td style={st.tdTruncate}>{c.oldValue || '—'}</td>
                              <td style={st.tdTruncate}>{c.newValue || '—'}</td>
                              <td style={{ ...st.td, fontSize: 12 }}>{c.userName || '—'}</td>
                              <td style={{ ...st.td, fontSize: 11, color: '#9ca3af' }}>{formatDate(c.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {totalPages > 1 && (
            <div style={st.pagination}>
              <button style={page <= 1 ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span style={st.pageInfo}>Page {page} of {totalPages}</span>
              <button style={page >= totalPages ? { ...st.pageBtn, ...st.pageBtnDisabled } : st.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function ChangeLogPanel() {
  const [view, setView] = useState<'individual' | 'batches'>('individual');

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <h3 style={st.title}>Change Log</h3>
          <p style={st.subtitle}>Immutable audit trail — every field change is recorded</p>
        </div>
      </div>

      {/* View toggle */}
      <div style={st.tabBar}>
        <button
          style={view === 'individual' ? { ...st.tab, ...st.tabActive } : st.tab}
          onClick={() => setView('individual')}
        >
          Individual
        </button>
        <button
          style={view === 'batches' ? { ...st.tab, ...st.tabActive } : st.tab}
          onClick={() => setView('batches')}
        >
          Batches
        </button>
      </div>

      {/* Content */}
      {view === 'individual' ? <IndividualView /> : <BatchView />}
    </div>
  );
}
