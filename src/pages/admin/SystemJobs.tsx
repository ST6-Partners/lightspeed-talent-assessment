// ============================================================
// SYSTEM JOBS — RCDO-pattern job runner UI
// Manual triggers, filter pills, color-coded run history table
// Reads from registered jobs + system_jobs run log
// ============================================================

import { useState, useCallback } from 'react';
import { trpc } from '../../lib/trpc';

// ── Status color map ────────────────────────────────────────
const statusColors: Record<string, { bg: string; text: string }> = {
  success: { bg: '#d1fae5', text: '#065f46' },
  fail:    { bg: '#fef2f2', text: '#991b1b' },
  running: { bg: '#dbeafe', text: '#1d4ed8' },
  timeout: { bg: '#fef3c7', text: '#92400e' },
};

const typeColors: Record<string, { bg: string; text: string }> = {
  cron:   { bg: '#f3e8ff', text: '#6b21a8' },
  manual: { bg: '#f0f9ff', text: '#0c4a6e' },
};

function formatTime(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Styles (matches RCDO SystemJobs inline styles) ──────────
const s = {
  container: { maxWidth: 1100 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 } as React.CSSProperties,
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 } as React.CSSProperties,
  refreshBtn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' } as React.CSSProperties,
  triggerBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 } as React.CSSProperties,
  triggerTitle: { fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 } as React.CSSProperties,
  triggerRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const } as React.CSSProperties,
  filterBar: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' as const } as React.CSSProperties,
  filterBtn: { padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer' } as React.CSSProperties,
  filterBtnActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13, tableLayout: 'fixed' as const } as React.CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  thCenter: { textAlign: 'center' as const, padding: '8px 12px', borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const } as React.CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' as const } as React.CSSProperties,
  tdCenter: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' as const, verticalAlign: 'top' as const } as React.CSSProperties,
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
  empty: { textAlign: 'center' as const, padding: 40, color: '#9ca3af', fontSize: 14 } as React.CSSProperties,
  resultBox: (success: boolean) => ({
    marginTop: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12,
    background: success ? '#f0fdf4' : '#fef2f2',
    color: success ? '#166534' : '#991b1b',
    border: `1px solid ${success ? '#bbf7d0' : '#fecaca'}`,
  }) as React.CSSProperties,
};

export default function SystemJobs() {
  const [filter, setFilter] = useState('all');
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{ job: string; success: boolean; details: string; affected: number } | null>(null);

  const utils = trpc.useContext();

  // Registered jobs (what CAN run)
  const { data: registeredJobs } = trpc.system.registeredJobs.useQuery();

  // Run history (what DID run)
  const { data: runsData, isLoading } = trpc.system.listJobRuns.useQuery(
    filter === 'all' ? { limit: 100 } : { limit: 100, jobName: filter },
  );

  const runMutation = trpc.system.runJob.useMutation({
    onSuccess: (result, variables) => {
      const run = result.run;
      const output = run?.output as any;
      setJobResult({
        job: variables.jobName,
        success: result.success,
        details: output?.details || run?.error || (result.success ? 'Completed' : 'Failed'),
        affected: output?.affected ?? 0,
      });
      // Refresh run history
      utils.system.listJobRuns.invalidate();
    },
    onError: (err, variables) => {
      setJobResult({
        job: variables.jobName,
        success: false,
        details: err.message || 'Failed',
        affected: 0,
      });
    },
    onSettled: () => {
      setRunningJob(null);
    },
  });

  const triggerJob = useCallback((jobName: string) => {
    setRunningJob(jobName);
    setJobResult(null);
    runMutation.mutate({ jobName });
  }, [runMutation]);

  const runs = runsData?.runs ?? [];

  // Build filter options from registered jobs + 'all'
  const jobNames = registeredJobs?.map((j: any) => j.name) ?? [];

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h3 style={s.title}>System Jobs</h3>
          <p style={s.subtitle}>Job execution history and manual triggers</p>
        </div>
        <button
          style={s.refreshBtn}
          onClick={() => utils.system.listJobRuns.invalidate()}
        >
          Refresh
        </button>
      </div>

      {/* Manual job triggers */}
      {registeredJobs && registeredJobs.length > 0 && (
        <div style={s.triggerBox}>
          <div style={s.triggerTitle}>Run Jobs Manually</div>
          <div style={s.triggerRow}>
            {registeredJobs.map((job: any) => (
              <button
                key={job.name}
                disabled={!!runningJob}
                title={job.description}
                onClick={() => triggerJob(job.name)}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: 'none', color: '#fff',
                  cursor: runningJob ? 'not-allowed' : 'pointer',
                  background: runningJob === job.name ? '#94a3b8' : job.color,
                  opacity: runningJob && runningJob !== job.name ? 0.5 : 1,
                }}
              >
                {runningJob === job.name ? 'Running...' : job.label}
              </button>
            ))}
          </div>
          {jobResult && (
            <div style={s.resultBox(jobResult.success)}>
              <strong>{jobResult.job}:</strong>{' '}
              {jobResult.success ? `Affected ${jobResult.affected} item${jobResult.affected !== 1 ? 's' : ''}` : 'Failed'}
              {' — '}{jobResult.details}
            </div>
          )}
        </div>
      )}

      {/* Filter pills */}
      <div style={s.filterBar}>
        <button
          style={filter === 'all' ? { ...s.filterBtn, ...s.filterBtnActive } : s.filterBtn}
          onClick={() => setFilter('all')}
        >
          All Jobs
        </button>
        {jobNames.map((name: string) => (
          <button
            key={name}
            style={filter === name ? { ...s.filterBtn, ...s.filterBtnActive } : s.filterBtn}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Run history table */}
      {isLoading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</p>
      ) : runs.length === 0 ? (
        <p style={s.empty}>
          {filter !== 'all'
            ? `No runs for "${filter}" filter.`
            : 'No job runs recorded yet. Use the buttons above to trigger a job manually.'}
        </p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 180 }}>Job</th>
              <th style={{ ...s.thCenter, width: 80 }}>Type</th>
              <th style={{ ...s.thCenter, width: 80 }}>Status</th>
              <th style={{ ...s.th, width: 160 }}>Started</th>
              <th style={{ ...s.thCenter, width: 80 }}>Duration</th>
              <th style={s.th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run: any) => {
              const sc = statusColors[run.status] || { bg: '#f3f4f6', text: '#374151' };
              const tc = typeColors[run.jobType] || { bg: '#f3f4f6', text: '#374151' };
              const output = run.output as any;
              const details = run.error
                ? run.error
                : output?.details || (output?.affected > 0 ? `${output.affected} item${output.affected !== 1 ? 's' : ''} affected` : 'Completed — no changes');

              return (
                <tr key={run.id} style={run.error ? { background: '#fef2f2' } : {}}>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.text }}>
                      {run.jobName}
                    </span>
                  </td>
                  <td style={s.tdCenter}>
                    <span style={{ ...s.badge, background: tc.bg, color: tc.text }}>
                      {run.jobType}
                    </span>
                  </td>
                  <td style={s.tdCenter}>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.text }}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    {formatTime(run.startedAt)}
                  </td>
                  <td style={{ ...s.tdCenter, fontFamily: 'monospace', fontSize: 12 }}>
                    {formatDuration(run.durationMs)}
                  </td>
                  <td style={{ ...s.td, fontSize: 12, lineHeight: '1.5', wordBreak: 'break-word' as const }}>
                    {run.error ? (
                      <span style={{ color: '#dc2626' }}>Error: {details}</span>
                    ) : (
                      details
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
