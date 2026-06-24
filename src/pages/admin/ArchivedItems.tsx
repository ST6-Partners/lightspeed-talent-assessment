// ============================================================
// ARCHIVED ITEMS — View and restore soft-deleted entities (RCDO pattern)
// Pattern: RCDO ArchivedItemsAdmin — filter, search, count badge,
// archived-by name, description preview, restore with audit trail
// ============================================================

import { useState, useCallback } from 'react';
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
  countBadge: { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700, background: '#fef3c7', color: '#92400e', marginLeft: 10 } as React.CSSProperties,
  refreshBtn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  filterRow: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end' } as React.CSSProperties,
  filterGroup: {} as React.CSSProperties,
  filterLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 3 } as React.CSSProperties,
  filterInput: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', width: 200, boxSizing: 'border-box' as const } as React.CSSProperties,
  filterSelect: { padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', background: '#fff', boxSizing: 'border-box' as const } as React.CSSProperties,
  clearBtn: { padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  thCenter: { textAlign: 'center' as const, padding: '10px 14px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
  tdCenter: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' as const } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  restoreBtn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  toast: { padding: '10px 16px', borderRadius: 6, fontSize: 13, marginBottom: 12, background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0' } as React.CSSProperties,
  toastError: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' } as React.CSSProperties,
  descPreview: { fontSize: 12, color: '#9ca3af', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  default: { bg: '#f3f4f6', text: '#374151' },
  project: { bg: '#dbeafe', text: '#1d4ed8' },
  task: { bg: '#fef3c7', text: '#92400e' },
  ticket: { bg: '#f3e8ff', text: '#6b21a8' },
};

export default function ArchivedItems() {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');

  const utils = trpc.useContext();
  const { data: items, isLoading } = trpc.entity.listArchived.useQuery({
    entityType: entityType || undefined,
    search: search || undefined,
  });

  const restoreMutation = trpc.entity.restore.useMutation({
    onSuccess: () => {
      setRestoringId(null);
      setToast({ msg: 'Item restored successfully.' });
      setTimeout(() => setToast(null), 4000);
      utils.entity.listArchived.invalidate();
      utils.entity.list.invalidate();
    },
    onError: (err) => {
      setRestoringId(null);
      setToast({ msg: `Restore failed: ${err.message}`, error: true });
      setTimeout(() => setToast(null), 6000);
    },
  });

  const handleRestore = useCallback((id: string) => {
    if (!window.confirm('Restore this archived item? It will become active again.')) return;
    setRestoringId(id);
    restoreMutation.mutate({ id });
  }, [restoreMutation]);

  // Extract unique entity types for filter
  const entityTypes = items
    ? [...new Set(items.map((i: any) => i.entityType))].filter(Boolean)
    : [];

  const clearFilters = () => { setSearch(''); setEntityType(''); };

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div>
            <h3 style={st.title}>
              Archived Items
              {items && items.length > 0 && (
                <span style={st.countBadge}>{items.length}</span>
              )}
            </h3>
            <p style={st.subtitle}>View and restore soft-deleted entities</p>
          </div>
        </div>
        <button
          style={st.refreshBtn}
          onClick={() => utils.entity.listArchived.invalidate()}
        >
          Refresh
        </button>
      </div>

      {/* Toast message */}
      {toast && (
        <div style={toast.error ? { ...st.toast, ...st.toastError } : st.toast}>
          {toast.msg}
        </div>
      )}

      {/* Filter row */}
      <div style={st.filterRow}>
        <div style={st.filterGroup}>
          <label style={st.filterLabel}>Search</label>
          <input
            style={st.filterInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or description..."
          />
        </div>
        <div style={st.filterGroup}>
          <label style={st.filterLabel}>Type</label>
          <select
            style={st.filterSelect}
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
          >
            <option value="">All Types</option>
            {entityTypes.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {(search || entityType) && (
          <button style={st.clearBtn} onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</p>
      ) : !items || items.length === 0 ? (
        <p style={st.empty}>
          {search || entityType
            ? 'No archived items match your filters.'
            : 'No archived items. When entities are archived, they will appear here for restoration.'}
        </p>
      ) : (
        <div style={st.card}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>Name</th>
                <th style={{ ...st.thCenter, width: 90 }}>Type</th>
                <th style={{ ...st.thCenter, width: 90 }}>Status</th>
                <th style={{ ...st.th, width: 120 }}>Owner</th>
                <th style={{ ...st.th, width: 120 }}>Archived By</th>
                <th style={{ ...st.th, width: 150 }}>Archived</th>
                <th style={{ ...st.thCenter, width: 90 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const tc = TYPE_COLORS[item.entityType] || TYPE_COLORS.default;
                return (
                  <tr key={item.id}>
                    <td style={{ ...st.td, fontWeight: 500 }}>
                      {item.name}
                      {item.description && (
                        <div style={st.descPreview} title={item.description}>
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td style={st.tdCenter}>
                      <span style={{ ...st.badge, background: tc.bg, color: tc.text }}>
                        {item.entityType}
                      </span>
                    </td>
                    <td style={st.tdCenter}>
                      <span style={{ ...st.badge, background: '#f3f4f6', color: '#6b7280' }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ ...st.td, fontSize: 12 }}>{item.ownerName || '—'}</td>
                    <td style={{ ...st.td, fontSize: 12 }}>{item.archivedByName || '—'}</td>
                    <td style={{ ...st.td, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {formatDate(item.archivedAt)}
                    </td>
                    <td style={st.tdCenter}>
                      <button
                        style={{
                          ...st.restoreBtn,
                          opacity: restoringId === item.id ? 0.5 : 1,
                          cursor: restoringId ? 'not-allowed' : 'pointer',
                        }}
                        disabled={!!restoringId}
                        onClick={() => handleRestore(item.id)}
                      >
                        {restoringId === item.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
