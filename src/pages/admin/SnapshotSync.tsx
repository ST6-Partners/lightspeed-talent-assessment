// ============================================================
// SNAPSHOT SYNC — Pull production snapshot, preview, sync
// Pattern: RCDO SnapshotSync with 3-step wizard (Pull → Preview → Sync)
// ============================================================

import { useState } from 'react';
import { trpc } from '../../lib/trpc';

type Step = 'idle' | 'pulling' | 'pulled' | 'previewing' | 'previewed' | 'syncing' | 'done' | 'error';

interface ComparisonRow {
  table: string;
  in_snapshot: boolean;
  snapshot_rows: number;
  live_rows: number;
  delta: number;
  action: string;
}

interface ImportResult {
  table: string;
  status: string;
  rows: number;
  reason?: string;
}

interface PreviewData {
  snapshot_date: string;
  snapshot_total_rows: number;
  live_total_rows: number;
  tables_in_snapshot: number;
  comparison: ComparisonRow[];
  importResults?: ImportResult[];
}

function formatDate(iso: string) {
  if (!iso || iso === 'unknown') return 'Unknown';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Styles (matches RCDO sync card styles) ──────────────────
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
  message: {
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
    border: '1px solid',
  } as React.CSSProperties,
};

// Step indicator labels for the 3-step wizard
const STEP_LABELS = ['1. Pull', '2. Preview', '3. Sync'];

export default function SnapshotSync() {
  const [step, setStep] = useState<Step>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const snapshotInfo = trpc.system.snapshotInfo.useQuery();

  const previewQuery = trpc.system.snapshotPreview.useQuery(undefined, {
    enabled: false, // manual fetch
  });

  const pullMutation = trpc.system.snapshotPull.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setStep('pulled');
        setMessage(result.message + (result.updated ? ' — ready to preview.' : ''));
        // Refresh snapshot info after pull
        snapshotInfo.refetch();
      } else {
        setStep('error');
        setMessage(result.message);
      }
    },
    onError: (err) => {
      setStep('error');
      setMessage(`Pull failed: ${err.message}`);
    },
  });

  const syncMutation = trpc.system.snapshotSync.useMutation({
    onSuccess: (result) => {
      setStep('done');
      const errCount = result.tables_errored || 0;
      setMessage(
        `Sync complete: ${result.total_imported.toLocaleString()} rows imported across ${result.tables_synced} tables.` +
        (result.tables_skipped > 0 ? ` ${result.tables_skipped} tables skipped.` : '') +
        (errCount > 0 ? ` ${errCount} tables had errors — check details below.` : '')
      );
      if (preview && result.results) {
        setPreview(prev => prev ? { ...prev, importResults: result.results } : null);
      }
    },
    onError: (err) => {
      setStep('error');
      setMessage(`Sync failed: ${err.message}`);
    },
  });

  // Step 1: Pull latest snapshot from git
  const handlePull = () => {
    setStep('pulling');
    setMessage('Pulling latest snapshot from git...');
    setPreview(null);
    pullMutation.mutate();
  };

  // Step 2: Preview — compare snapshot vs live DB
  const handlePreview = async () => {
    setStep('previewing');
    setMessage('Comparing snapshot to live database...');
    try {
      const result = await previewQuery.refetch();
      if (result.data) {
        setPreview(result.data);
        setStep('previewed');
        setMessage(
          `${result.data.tables_in_snapshot} tables in snapshot (${result.data.snapshot_total_rows.toLocaleString()} rows) vs ${result.data.live_total_rows.toLocaleString()} rows in live DB.`
        );
      } else {
        setStep('error');
        setMessage('No snapshot file found. Pull from git first, or export from production.');
      }
    } catch (err: any) {
      setStep('error');
      setMessage(`Preview failed: ${err.message}`);
    }
  };

  // Step 3: Execute sync
  const handleSync = () => {
    if (!window.confirm(
      'This will REPLACE all data in this database with the production snapshot. This cannot be undone.\n\nContinue?'
    )) return;

    setStep('syncing');
    setMessage('Syncing... this may take a moment.');
    syncMutation.mutate();
  };

  const statusColor = step === 'error' ? '#dc2626' : step === 'done' ? '#059669' : '#2563eb';
  const snapshotExists = snapshotInfo.data?.exists;

  // Determine which wizard step is active / done
  const getStepState = (idx: number) => {
    const stepNum = idx + 1;
    const isActive =
      (stepNum === 1 && ['idle', 'pulling', 'error'].includes(step)) ||
      (stepNum === 2 && ['pulled', 'previewing'].includes(step)) ||
      (stepNum === 3 && ['previewed', 'syncing'].includes(step));
    const isDone =
      (stepNum === 1 && !['idle', 'pulling', 'error'].includes(step)) ||
      (stepNum === 2 && ['previewed', 'syncing', 'done'].includes(step)) ||
      (stepNum === 3 && step === 'done');
    return { isActive, isDone };
  };

  return (
    <div>
      <div style={s.card}>
        <div style={s.title}>Sync from Production</div>
        <p style={s.desc}>
          Pull the latest production database snapshot from git, preview the differences,
          and replace all data in this environment. Three-step process: Pull → Preview → Sync.
        </p>

        {/* Snapshot status */}
        {snapshotInfo.data && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 12 }}>
            {snapshotExists ? (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
                <span><strong>Snapshot found:</strong> {formatDate(snapshotInfo.data.date || '')}</span>
                {snapshotInfo.data.totalRows != null && (
                  <span>{snapshotInfo.data.totalRows?.toLocaleString()} rows</span>
                )}
                {snapshotInfo.data.fileSize && <span>{snapshotInfo.data.fileSize}</span>}
                {(snapshotInfo.data as any).exportedBy && (
                  <span>by {(snapshotInfo.data as any).exportedBy}</span>
                )}
              </div>
            ) : (
              <span style={{ color: '#9ca3af' }}>
                No snapshot file found. Pull from git or export from production first.
              </span>
            )}
          </div>
        )}

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {STEP_LABELS.map((label, i) => {
            const { isActive, isDone } = getStepState(i);
            return (
              <div key={i} style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: isDone ? '#dcfce7' : isActive ? '#eff6ff' : '#f3f4f6',
                color: isDone ? '#059669' : isActive ? '#2563eb' : '#9ca3af',
                border: `1px solid ${isDone ? '#bbf7d0' : isActive ? '#bfdbfe' : '#e5e7eb'}`,
              }}>
                {isDone ? '\u2713 ' : ''}{label}
              </div>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {/* Pull button */}
          <button
            onClick={handlePull}
            disabled={step === 'pulling' || step === 'syncing'}
            style={{
              ...s.btn,
              background: step === 'pulling' ? '#94a3b8' : '#6366f1',
              opacity: (step === 'pulling' || step === 'syncing') ? 0.5 : 1,
            }}
          >
            {step === 'pulling' ? 'Pulling...' : 'Pull from Git'}
          </button>

          {/* Preview button — available after pull or if snapshot already exists */}
          <button
            onClick={handlePreview}
            disabled={!snapshotExists || step === 'previewing' || step === 'syncing' || step === 'pulling'}
            style={{
              ...s.btn,
              background: step === 'previewing' ? '#94a3b8' : preview ? '#059669' : '#2563eb',
              opacity: (!snapshotExists || step === 'previewing' || step === 'syncing' || step === 'pulling') ? 0.5 : 1,
            }}
          >
            {step === 'previewing' ? 'Comparing...' : 'Preview'}
          </button>

          {/* Sync button — only after preview */}
          {(step === 'previewed' || step === 'done') && (
            <button
              onClick={handleSync}
              disabled={step === 'done'}
              style={{
                ...s.btn,
                background: step === 'done' ? '#94a3b8' : '#dc2626',
                opacity: step === 'done' ? 0.5 : 1,
              }}
            >
              {step === 'done' ? 'Synced' : 'Sync Now'}
            </button>
          )}
        </div>

        {/* Status message */}
        {message && (
          <div style={{
            ...s.message,
            background: step === 'error' ? '#fef2f2' : step === 'done' ? '#f0fdf4' : '#eff6ff',
            color: statusColor,
            borderColor: step === 'error' ? '#fecaca' : step === 'done' ? '#bbf7d0' : '#bfdbfe',
          }}>
            {(step === 'pulling' || step === 'previewing' || step === 'syncing') && (
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 8, verticalAlign: 'middle' }} />
            )}
            {message}
          </div>
        )}
      </div>

      {/* Preview comparison table */}
      {preview && (
        <div style={s.card}>
          <div style={s.title}>Comparison: Snapshot vs Live Database</div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px 0' }}>
            Snapshot from {formatDate(preview.snapshot_date)}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Table</th>
                <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Snapshot</th>
                <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Live</th>
                <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Delta</th>
                <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'center', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Action</th>
                {preview.importResults && (
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'center', color: '#6b7280', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' as const }}>Result</th>
                )}
              </tr>
            </thead>
            <tbody>
              {preview.comparison.filter(c => c.in_snapshot || c.live_rows > 0).map(c => {
                const importResult = preview.importResults?.find(r => r.table === c.table);
                return (
                  <tr key={c.table} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 500, color: c.in_snapshot ? '#1a1a2e' : '#9ca3af' }}>{c.table}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.in_snapshot ? c.snapshot_rows.toLocaleString() : '\u2014'}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.live_rows.toLocaleString()}
                    </td>
                    <td style={{
                      padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      color: c.delta > 0 ? '#059669' : c.delta < 0 ? '#dc2626' : '#9ca3af',
                    }}>
                      {c.delta > 0 ? '+' : ''}{c.delta !== 0 ? c.delta.toLocaleString() : '\u2014'}
                    </td>
                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: c.action === 'replace' ? '#eff6ff' : c.action === 'clear' ? '#fef9c3' : '#f3f4f6',
                        color: c.action === 'replace' ? '#2563eb' : c.action === 'clear' ? '#a16207' : '#9ca3af',
                      }}>
                        {c.action}
                      </span>
                    </td>
                    {preview.importResults && (
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        {importResult && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: importResult.status === 'ok' ? '#dcfce7' : importResult.status === 'error' ? '#fee2e2' : '#f3f4f6',
                            color: importResult.status === 'ok' ? '#059669' : importResult.status === 'error' ? '#dc2626' : '#9ca3af',
                          }}>
                            {importResult.status === 'ok' ? `${importResult.rows} rows` : importResult.status === 'error' ? 'error' : importResult.reason || 'skipped'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {preview.snapshot_total_rows.toLocaleString()}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {preview.live_total_rows.toLocaleString()}
                </td>
                <td colSpan={preview.importResults ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
