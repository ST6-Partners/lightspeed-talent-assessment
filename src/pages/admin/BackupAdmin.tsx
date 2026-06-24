// ============================================================
// BACKUP ADMIN — RCDO-pattern backup panel with SQLite snapshots
// Create, list, download, restore, delete with retention policy
// ============================================================

import { useState, Fragment } from 'react';
import { trpc } from '../../lib/trpc';

const triggerColors: Record<string, { bg: string; color: string }> = {
  nightly: { bg: '#dbeafe', color: '#1d4ed8' },
  manual: { bg: '#d1fae5', color: '#065f46' },
  'pre-restore': { bg: '#fef3c7', color: '#92400e' },
  unknown: { bg: '#f3f4f6', color: '#6b7280' },
};

function formatTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Styles (matches RCDO BackupAdmin inline styles) ─────────
const bk = {
  container: { maxWidth: 900 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  actionBar: { display: 'flex', gap: 8, alignItems: 'center' } as React.CSSProperties,
  btn: { padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  btnPrimary: { padding: '6px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' } as React.CSSProperties,
  btnDanger: { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' } as React.CSSProperties,
  btnSmall: { padding: '3px 10px', fontSize: 11, fontWeight: 500, borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const },
  thCenter: { textAlign: 'center' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const },
  thRight: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const },
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const },
  tdCenter: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' as const, verticalAlign: 'middle' as const },
  tdRight: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' as const, verticalAlign: 'middle' as const },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  msgSuccess: { padding: '8px 14px', borderRadius: 6, background: '#d1fae5', color: '#065f46', fontSize: 13, marginBottom: 12 } as React.CSSProperties,
  msgError: { padding: '8px 14px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 12 } as React.CSSProperties,
  retentionNote: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic' as const },
  expandRow: { background: '#f9fafb', borderBottom: '1px solid #f3f4f6' },
  expandCell: { padding: '8px 12px 12px', fontSize: 12, color: '#6b7280' } as React.CSSProperties,
  confirmBox: { padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
  confirmText: { fontSize: 13, color: '#991b1b', flex: 1 } as React.CSSProperties,
};

export default function BackupAdmin() {
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedBackup, setExpandedBackup] = useState<string | null>(null);

  const utils = trpc.useContext();
  const { data, isLoading, refetch } = trpc.system.backupList.useQuery();
  const backups = data?.backups || [];
  const retention = data?.retention || { daily: 7, weekly: 4 };

  const createMutation = trpc.system.backupCreate.useMutation({
    onSuccess: (result) => {
      setMessage({
        type: 'success',
        text: `Backup created: ${result.filename} — ${result.totalRows} rows, ${result.fileSize}${result.pruned > 0 ? ` (${result.pruned} old backups pruned)` : ''}`,
      });
      refetch();
    },
    onError: (err) => setMessage({ type: 'error', text: `Backup failed: ${err.message}` }),
    onSettled: () => setRunning(false),
  });

  const deleteMutation = trpc.system.backupDelete.useMutation({
    onSuccess: (_, vars) => {
      setMessage({ type: 'success', text: `Deleted ${vars.filename}` });
      refetch();
    },
    onError: (err) => setMessage({ type: 'error', text: `Delete failed: ${err.message}` }),
  });

  const restoreMutation = trpc.system.backupRestore.useMutation({
    onSuccess: (result) => {
      setMessage({
        type: 'success',
        text: `Restored from ${result.sourceBackup} — ${result.restoredRows} rows across ${result.tablesRestored} tables. Safety backup: ${result.safetyBackup}`,
      });
      refetch();
    },
    onError: (err) => setMessage({ type: 'error', text: `Restore failed: ${err.message}` }),
    onSettled: () => setRestoring(null),
  });

  const triggerBackup = () => {
    setRunning(true);
    setMessage(null);
    createMutation.mutate();
  };

  const triggerRestore = (filename: string) => {
    setRestoring(filename);
    setMessage(null);
    setConfirmRestore(null);
    restoreMutation.mutate({ filename });
  };

  const deleteBackup = (filename: string) => {
    if (!window.confirm(`Delete ${filename}?`)) return;
    deleteMutation.mutate({ filename });
  };

  const downloadBackup = (filename: string) => {
    window.open(`/api/backups/${filename}/download`, '_blank');
  };

  return (
    <div style={bk.container}>
      <div style={bk.header}>
        <div>
          <h3 style={bk.title}>Database Backups</h3>
          <p style={bk.subtitle}>
            SQLite snapshots with {retention.daily}-day daily + {retention.weekly}-week weekly retention.
          </p>
        </div>
        <div style={bk.actionBar}>
          <button style={bk.btn} onClick={() => refetch()}>Refresh</button>
          <button
            style={{ ...bk.btnPrimary, opacity: running ? 0.6 : 1 }}
            onClick={triggerBackup}
            disabled={running}
          >
            {running ? 'Backing up...' : 'Backup Now'}
          </button>
        </div>
      </div>

      {message && (
        <div style={message.type === 'success' ? bk.msgSuccess : bk.msgError}>
          {message.text}
          <span
            style={{ float: 'right', cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setMessage(null)}
          >×</span>
        </div>
      )}

      {confirmRestore && (
        <div style={bk.confirmBox}>
          <span style={bk.confirmText}>
            Restore from <strong>{confirmRestore}</strong>? This will replace ALL data in the live database.
            A safety backup of the current state will be created first.
          </span>
          <button style={bk.btnDanger} onClick={() => triggerRestore(confirmRestore)}>
            Yes, Restore
          </button>
          <button style={bk.btnSmall} onClick={() => setConfirmRestore(null)}>Cancel</button>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading backups...</p>
      ) : backups.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
          No backups yet. Click "Backup Now" to create the first one.
        </p>
      ) : (
        <>
          <table style={bk.table}>
            <thead>
              <tr>
                <th style={bk.th}>Date</th>
                <th style={bk.thCenter}>Trigger</th>
                <th style={bk.thRight}>Rows</th>
                <th style={bk.thRight}>Tables</th>
                <th style={bk.thRight}>Size</th>
                <th style={bk.thCenter}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b: any) => (
                <Fragment key={b.filename}>
                  <tr
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onClick={() => setExpandedBackup(expandedBackup === b.filename ? null : b.filename)}
                  >
                    <td style={bk.td}>
                      <div style={{ fontWeight: 500 }}>{formatTime(b.createdAt)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{b.filename}</div>
                    </td>
                    <td style={bk.tdCenter}>
                      <span style={{
                        ...bk.badge,
                        background: (triggerColors[b.trigger] || triggerColors.unknown).bg,
                        color: (triggerColors[b.trigger] || triggerColors.unknown).color,
                      }}>
                        {b.trigger}
                      </span>
                    </td>
                    <td style={bk.tdRight}>{b.totalRows != null ? b.totalRows.toLocaleString() : '—'}</td>
                    <td style={bk.tdRight}>{b.tableCount || '—'}</td>
                    <td style={bk.tdRight}>{b.fileSize}</td>
                    <td style={bk.tdCenter}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                        <button style={bk.btnSmall} onClick={() => downloadBackup(b.filename)} title="Download">↓</button>
                        <button
                          style={{ ...bk.btnSmall, color: '#2563eb', borderColor: '#93c5fd' }}
                          onClick={() => setConfirmRestore(b.filename)}
                          disabled={restoring === b.filename}
                          title="Restore from this backup"
                        >
                          {restoring === b.filename ? '...' : '↻'}
                        </button>
                        <button
                          style={{ ...bk.btnSmall, color: '#dc2626', borderColor: '#fca5a5' }}
                          onClick={() => deleteBackup(b.filename)}
                          title="Delete"
                        >×</button>
                      </div>
                    </td>
                  </tr>
                  {expandedBackup === b.filename && b.tableCounts && (
                    <tr style={bk.expandRow}>
                      <td colSpan={6} style={bk.expandCell}>
                        <strong>Table breakdown:</strong>{' '}
                        {Object.entries(b.tableCounts as Record<string, number>)
                          .filter(([, count]) => count > 0)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                          .map(([table, count]) => `${table} (${count})`)
                          .join(' · ')}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p style={{ ...bk.retentionNote, marginTop: 12 }}>
            Retention: {retention.daily} daily + {retention.weekly} weekly backups kept. Older backups are automatically pruned.
          </p>
        </>
      )}
    </div>
  );
}
