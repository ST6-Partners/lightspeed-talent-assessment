// ============================================================
// DATABASE EXPORT — Export production snapshot for sync
// Pattern: RCDO DatabaseExport component in AdminSettings.jsx
// Creates app-snapshot.db, optionally commits + pushes to git
// ============================================================

import { useState, useCallback } from 'react';
import { trpc } from '../../lib/trpc';

function formatDate(iso: string) {
  if (!iso || iso === 'unknown') return 'Unknown';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Styles (matches RCDO export card styles) ────────────────
const s = {
  card: {
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    padding: '16px 20px',
    marginBottom: 16,
  } as React.CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: 4,
  } as React.CSSProperties,
  desc: {
    fontSize: 12,
    color: '#6b7280',
    margin: '0 0 16px 0',
    lineHeight: 1.5,
  } as React.CSSProperties,
  btn: {
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
  } as React.CSSProperties,
  metaRow: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#374151',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  metaLabel: {
    color: '#6b7280',
    fontWeight: 600,
  } as React.CSSProperties,
  message: {
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginTop: 12,
    border: '1px solid',
  } as React.CSSProperties,
  infoBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: '10px 14px',
    marginBottom: 16,
    fontSize: 12,
    color: '#475569',
    lineHeight: 1.6,
  } as React.CSSProperties,
};

export default function DatabaseExport() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const utils = trpc.useContext();
  const snapshotInfo = trpc.system.snapshotInfo.useQuery();

  const exportMutation = trpc.system.snapshotExport.useMutation({
    onSuccess: (data) => {
      setExporting(false);
      setResult({
        success: true,
        message: `Exported ${data.totalRows.toLocaleString()} rows across ${data.tableCount} tables (${data.fileSize})`,
        details: data.gitCommit ? `Git commit: ${data.gitCommit}` : undefined,
      });
      // Refresh snapshot info
      utils.system.snapshotInfo.invalidate();
    },
    onError: (err) => {
      setExporting(false);
      setResult({
        success: false,
        message: `Export failed: ${err.message}`,
      });
    },
  });

  const handleExport = useCallback(() => {
    if (!window.confirm(
      'This will create a new app-snapshot.db from the current database and push it to git.\n\nContinue?'
    )) return;

    setExporting(true);
    setResult(null);
    exportMutation.mutate({ gitPush: true });
  }, [exportMutation]);

  const info = snapshotInfo.data;

  return (
    <div>
      {/* Export card */}
      <div style={s.card}>
        <div style={s.title}>Database Export</div>
        <p style={s.desc}>
          Export the current database to a portable SQLite snapshot file (app-snapshot.db).
          This snapshot is committed to git and used by other environments to sync data.
        </p>

        {/* Last export metadata */}
        {info?.exists && (
          <div style={{ ...s.infoBox, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>Last Export</div>
            <div style={s.metaRow}>
              <span><span style={s.metaLabel}>Date:</span> {formatDate(info.date || '')}</span>
              {info.totalRows != null && (
                <span><span style={s.metaLabel}>Rows:</span> {info.totalRows.toLocaleString()}</span>
              )}
              {info.fileSize && (
                <span><span style={s.metaLabel}>Size:</span> {info.fileSize}</span>
              )}
              {info.exportedBy && (
                <span><span style={s.metaLabel}>By:</span> {info.exportedBy}</span>
              )}
            </div>
          </div>
        )}

        {!info?.exists && (
          <div style={{ ...s.infoBox, background: '#fffbeb', borderColor: '#fde68a' }}>
            <span style={{ color: '#92400e' }}>
              No snapshot file found. Click Export to create one.
            </span>
          </div>
        )}

        {/* How it works info */}
        <div style={s.infoBox}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>How it works</div>
          <div>1. Reads all tables from the current PostgreSQL database</div>
          <div>2. Writes them into a portable SQLite file (app-snapshot.db)</div>
          <div>3. Commits the snapshot to git and pushes to the remote</div>
          <div>4. Other environments pull the snapshot and sync via the Sync tab</div>
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            ...s.btn,
            background: exporting ? '#94a3b8' : '#2563eb',
            opacity: exporting ? 0.7 : 1,
            cursor: exporting ? 'not-allowed' : 'pointer',
          }}
        >
          {exporting ? 'Exporting...' : 'Export Snapshot'}
        </button>

        {/* Result message */}
        {result && (
          <div style={{
            ...s.message,
            background: result.success ? '#f0fdf4' : '#fef2f2',
            color: result.success ? '#059669' : '#dc2626',
            borderColor: result.success ? '#bbf7d0' : '#fecaca',
          }}>
            {exporting && (
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 8, verticalAlign: 'middle' }} />
            )}
            {result.message}
            {result.details && (
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{result.details}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
