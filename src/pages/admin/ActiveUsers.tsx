// ============================================================
// ACTIVE USERS — RCDO-pattern active user badges with time window
// Time window selector, green dot badges, count badge, auto-refresh
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '../../lib/trpc';

const TIME_WINDOWS = [2, 5, 15, 30, 60, 120, 180, 240] as const;

function formatWindowLabel(m: number): string {
  return m >= 60 ? `${m / 60}h` : `${m}m`;
}

function formatEmptyLabel(m: number): string {
  if (m >= 60) {
    const hours = m / 60;
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${m} minutes`;
}

// ── Styles (matches RCDO BroadcastAdmin inline styles) ──────
const s = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a2e',
    margin: 0,
  } as React.CSSProperties,
  countBadge: (hasUsers: boolean) => ({
    marginLeft: 8,
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    background: hasUsers ? '#16a34a' : '#9ca3af',
    padding: '2px 10px',
    borderRadius: 12,
  }) as React.CSSProperties,
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,
  windowLabel: {
    fontSize: 12,
    color: '#6b7280',
  } as React.CSSProperties,
  windowBtn: (active: boolean) => ({
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    cursor: 'pointer',
    border: active ? '1px solid #2563eb' : '1px solid #d1d5db',
    background: active ? '#EFF6FF' : '#fff',
    color: active ? '#2563eb' : '#374151',
  }) as React.CSSProperties,
  refreshBtn: (flash: boolean) => ({
    padding: '3px 10px',
    fontSize: 12,
    border: flash ? '1px solid #16a34a' : '1px solid #d1d5db',
    borderRadius: 4,
    background: flash ? '#f0fdf4' : '#fff',
    color: flash ? '#16a34a' : '#374151',
    cursor: 'pointer',
    transition: 'all 0.3s',
  }) as React.CSSProperties,
  userGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  } as React.CSSProperties,
  userBadge: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 6,
    background: '#f3f4f6',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  } as React.CSSProperties,
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#16a34a',
    display: 'inline-block',
  } as React.CSSProperties,
  timeLabel: {
    color: '#9ca3af',
    fontSize: 11,
  } as React.CSSProperties,
  empty: {
    fontSize: 13,
    color: '#9ca3af',
    margin: 0,
  } as React.CSSProperties,
};

export default function ActiveUsers() {
  const [minutes, setMinutes] = useState(5);
  const [refreshFlash, setRefreshFlash] = useState(false);

  const { data, refetch } = trpc.system.activeUsers.useQuery({ minutes });

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Re-fetch when window changes
  // (React Query handles this via the query key changing with `minutes`)

  const handleRefresh = useCallback(() => {
    refetch();
    setRefreshFlash(true);
    setTimeout(() => setRefreshFlash(false), 1500);
  }, [refetch]);

  const userCount = data?.count ?? 0;
  const users = data?.users ?? [];

  return (
    <div style={s.card}>
      {/* Header: title + count badge + controls */}
      <div style={s.header}>
        <h3 style={s.title}>
          Active Users
          <span style={s.countBadge(userCount > 0)}>
            {userCount}
          </span>
        </h3>
        <div style={s.controls}>
          <span style={s.windowLabel}>Window:</span>
          {TIME_WINDOWS.map(m => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              style={s.windowBtn(minutes === m)}
            >
              {formatWindowLabel(m)}
            </button>
          ))}
          <button onClick={handleRefresh} style={s.refreshBtn(refreshFlash)}>
            {refreshFlash ? '\u2713 Refreshed' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* User badges or empty state */}
      {userCount > 0 ? (
        <div style={s.userGrid}>
          {users.map((u: any) => (
            <span key={u.id} style={s.userBadge}>
              <span style={s.greenDot} />
              {u.name}
              <span style={s.timeLabel}>
                {u.lastActiveAt
                  ? new Date(u.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p style={s.empty}>
          No users active in the last {formatEmptyLabel(minutes)}.
        </p>
      )}
    </div>
  );
}
