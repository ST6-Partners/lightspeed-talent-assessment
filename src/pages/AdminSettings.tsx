// ============================================================
// ADMIN SETTINGS — RCDO-style tabbed hub with 4 permission tiers
// User | Analytics | Configuration | System
// Matches RCDO AdminSettings.jsx visual pattern exactly
// ============================================================

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { trpc } from '../lib/trpc';
import {
  ChangeLogPanel,
  FeedbackPanel,
  TelemetryPanel,
  UserManagement,
  PromptAdmin,
  DatabaseViews,
  SystemJobs,
  BackupAdmin,
  DatabaseExport,
  SnapshotSync,
  ActiveUsers,
  ArchivedItems,
  GettingStarted,
  ChatLogs,
  SatisfactionDashboard,
  ReleaseNotesAdmin,
  EmailTestPanel,
  DocumentIndexPanel,
} from './admin';

// ── Feature flags panel (simple settings table) ──────────────
function FeatureFlags() {
  const { data: settings } = trpc.admin.getSettings.useQuery();

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      {!settings || settings.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          No settings configured. Run <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>npm run db:seed</code> to populate defaults.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const }}>Key</th>
              <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const }}>Value</th>
              <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' as const }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((setting: any) => (
              <tr key={setting.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', color: '#111827' }}>{setting.key}</td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    fontSize: 12,
                    borderRadius: 9999,
                    background: setting.value === true ? '#dcfce7' : setting.value === false ? '#fef2f2' : '#f3f4f6',
                    color: setting.value === true ? '#166534' : setting.value === false ? '#991b1b' : '#374151',
                  }}>
                    {JSON.stringify(setting.value)}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: '#6b7280' }}>{setting.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Release Notes panel — now uses full CRUD admin component ──

// ── Tab configuration by permission tier ─────────────────────
const USER_TABS = [
  { id: 'gettingstarted', label: 'Getting Started' },
  { id: 'changelog', label: 'Change Log' },
  { id: 'releases', label: 'Releases' },
  { id: 'flags', label: 'Feature Flags' },
  { id: 'export', label: 'Export' },
];

const ANALYTICS_TABS = [
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'chatlogs', label: 'Chat Logs' },
  { id: 'satisfaction', label: 'Satisfaction' },
];

const CONFIG_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'emailalerts', label: 'Email Alerts' },
  { id: 'archived', label: 'Archived Items' },
];

const SYSTEM_TABS = [
  { id: 'prompts', label: 'Prompts' },
  { id: 'activeusers', label: 'Active Users' },
  { id: 'systemjobs', label: 'System Jobs' },
  { id: 'backups', label: 'Backups' },
  { id: 'sync', label: 'Sync' },
  { id: 'database', label: 'Database' },
  { id: 'emailtest', label: 'Email Test' },
  { id: 'docindex', label: 'Document Index' },
];

// ── Styles — matches RCDO AdminSettings.jsx inline styles ────
const s = {
  container: {
    padding: '16px 24px',
    height: '100%',
    overflow: 'auto',
    background: '#f9fafb',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  } as React.CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a1a2e',
    margin: 0,
  } as React.CSSProperties,
  tabRow: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '2px solid #e5e7eb',
    marginBottom: 0,
  } as React.CSSProperties,
  tabRowLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    width: 110,
    flexShrink: 0,
    paddingLeft: 4,
  } as React.CSSProperties,
  tabRowTabs: {
    display: 'flex',
    gap: 0,
    marginLeft: 8,
  } as React.CSSProperties,
  sectionTab: {
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
    background: 'none',
    border: 'none',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    marginBottom: -2,
    cursor: 'pointer',
    transition: 'color 0.15s',
    minWidth: 120,
    textAlign: 'left' as const,
  } as React.CSSProperties,
  sectionTabActive: {
    color: '#2563eb',
    borderBottomColor: '#2563eb',
  } as React.CSSProperties,
  content: {
    marginTop: 8,
  } as React.CSSProperties,
};

// ── TabRow component ─────────────────────────────────────────
interface TabRowProps {
  label: string;
  tabs: { id: string; label: string }[];
  activeSection: string;
  onSelect: (id: string) => void;
}

function TabRow({ label, tabs, activeSection, onSelect }: TabRowProps) {
  return (
    <div style={s.tabRow}>
      <span style={s.tabRowLabel}>{label}</span>
      <div style={s.tabRowTabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={
              activeSection === tab.id
                ? { ...s.sectionTab, ...s.sectionTabActive }
                : s.sectionTab
            }
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailAlerts() {
  const utils = trpc.useContext();
  const { data, isLoading } = trpc.admin.listAlertPrefs.useQuery();
  const save = trpc.admin.setAlertPrefs.useMutation({ onSuccess: () => { setDraft(null); utils.admin.listAlertPrefs.invalidate(); } });
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const prefs = draft ?? data?.prefs ?? {};
  const templates = data?.templates ?? [];

  if (isLoading) return <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Loading…</div>;

  const groups = Array.from(new Set(templates.map((t: any) => t.group)));
  const toggle = (id: string) => setDraft({ ...prefs, [id]: !(prefs[id] !== false) });

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: 20, maxWidth: 640 }}>
      <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Turn automated alert emails on or off. Candidate-facing emails (application received, offer, rejection) are always on and not listed here.
      </div>
      {groups.map((g) => (
        <div key={g as string} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, marginBottom: 6 }}>{g as string}</div>
          {templates.filter((t: any) => t.group === g).map((t: any) => {
            const on = prefs[t.id] !== false;
            return (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, color: '#374151' }}>{t.label}</span>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
              </label>
            );
          })}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button
          onClick={() => save.mutate({ prefs })}
          disabled={save.isLoading || !draft}
          style={{ padding: '8px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: draft ? 'pointer' : 'default', opacity: draft ? 1 : 0.5 }}>
          {save.isLoading ? 'Saving…' : 'Save'}
        </button>
        {save.isSuccess && !draft && <span style={{ fontSize: 13, color: '#059669' }}>Saved</span>}
      </div>
    </div>
  );
}

// ── Main AdminSettings page ──────────────────────────────────
export default function AdminSettings() {
  const [activeSection, setActiveSection] = useState('gettingstarted');

  // Role-gated tiers (DD-012 four-tier role model). Analytics/Config require
  // admin; System (Backups, Database, User Management) requires sysadmin.
  const { data: me } = trpc.auth.me.useQuery();
  const rank = ({ user: 1, manager: 2, admin: 3, sysadmin: 4 } as Record<string, number>)[(me as any)?.role] ?? 0;
  const showAnalytics = rank >= 3;
  const showConfig = rank >= 3;
  const showSystem = rank >= 4;

  // Only admins+ may open Settings at all. Non-admins are redirected even if
  // they reach the URL directly. (me undefined = still loading; wait.)
  if (me && rank < 3) return <Navigate to="/hiring/candidates" replace />;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <Settings size={22} color="#374151" />
        <h2 style={s.title}>Settings</h2>
      </div>

      {/* Tab rows by permission tier — matches RCDO exactly */}
      <TabRow label="User" tabs={USER_TABS} activeSection={activeSection} onSelect={setActiveSection} />
      {showAnalytics && (
        <TabRow label="Analytics" tabs={ANALYTICS_TABS} activeSection={activeSection} onSelect={setActiveSection} />
      )}
      {showConfig && (
        <TabRow label="Config" tabs={CONFIG_TABS} activeSection={activeSection} onSelect={setActiveSection} />
      )}
      {showSystem && (
        <TabRow label="System" tabs={SYSTEM_TABS} activeSection={activeSection} onSelect={setActiveSection} />
      )}

      {/* Panel content */}
      <div style={s.content}>
        {activeSection === 'gettingstarted' && <GettingStarted />}
        {activeSection === 'changelog' && <ChangeLogPanel />}
        {activeSection === 'releases' && <ReleaseNotesAdmin />}
        {activeSection === 'flags' && <FeatureFlags />}
        {activeSection === 'export' && <DatabaseExport />}
        {activeSection === 'telemetry' && showAnalytics && <TelemetryPanel />}
        {activeSection === 'feedback' && showAnalytics && <FeedbackPanel />}
        {activeSection === 'chatlogs' && showAnalytics && <ChatLogs />}
        {activeSection === 'satisfaction' && showAnalytics && <SatisfactionDashboard />}
        {activeSection === 'users' && showConfig && <UserManagement />}
        {activeSection === 'emailalerts' && showConfig && <EmailAlerts />}
        {activeSection === 'archived' && showConfig && <ArchivedItems />}
        {activeSection === 'prompts' && showSystem && <PromptAdmin />}
        {activeSection === 'activeusers' && showSystem && <ActiveUsers />}
        {activeSection === 'systemjobs' && showSystem && <SystemJobs />}
        {activeSection === 'backups' && showSystem && <BackupAdmin />}
        {activeSection === 'sync' && showSystem && <SnapshotSync />}
        {activeSection === 'database' && showSystem && <DatabaseViews />}
        {activeSection === 'emailtest' && showSystem && <EmailTestPanel />}
        {activeSection === 'docindex' && showSystem && <DocumentIndexPanel />}
      </div>
    </div>
  );
}
