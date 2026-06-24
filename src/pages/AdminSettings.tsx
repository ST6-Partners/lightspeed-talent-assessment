// ============================================================
// ADMIN SETTINGS — RCDO-style tabbed hub with 4 permission tiers
// User | Analytics | Configuration | System
// Matches RCDO AdminSettings.jsx visual pattern exactly
// ============================================================

import { useState } from 'react';
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
  { id: 'archived', label: 'Archived Items' },
];

const SYSTEM_TABS = [
  { id: 'prompts', label: 'Prompts' },
  { id: 'activeusers', label: 'Active Users' },
  { id: 'systemjobs', label: 'System Jobs' },
  { id: 'backups', label: 'Backups' },
  { id: 'sync', label: 'Sync' },
  { id: 'database', label: 'Database' },
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

// ── Main AdminSettings page ──────────────────────────────────
export default function AdminSettings() {
  const [activeSection, setActiveSection] = useState('gettingstarted');

  // In a real app, these come from auth context (DD-012 four-tier role model)
  // For the template, show all tiers — adopter configures per their role model
  const showAnalytics = true;
  const showConfig = true;
  const showSystem = true;

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
        {activeSection === 'archived' && showConfig && <ArchivedItems />}
        {activeSection === 'prompts' && showSystem && <PromptAdmin />}
        {activeSection === 'activeusers' && showSystem && <ActiveUsers />}
        {activeSection === 'systemjobs' && showSystem && <SystemJobs />}
        {activeSection === 'backups' && showSystem && <BackupAdmin />}
        {activeSection === 'sync' && showSystem && <SnapshotSync />}
        {activeSection === 'database' && showSystem && <DatabaseViews />}
      </div>
    </div>
  );
}
