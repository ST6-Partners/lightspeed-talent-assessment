// ============================================================
// SEED SCRIPT — bootstrap user-independent data for development
// Run: npm run db:seed
//
// User records are not seeded — users are created when they register
// (email/password). Seed data for feedback / change log / notifications /
// telemetry depended on seed users and has been removed too; those
// systems populate naturally from real usage after first registration.
//
// The first account registered with SEED_SUPER_ADMIN_EMAIL is
// auto-promoted to sysadmin by the auth router — see
// server/src/routers/auth.ts.
// ============================================================

import { db } from './db.js';
import { appSettings, screenInventory } from './db/schema/core.js';

async function seed() {
  console.log('Seeding Template App database...');

  // App Settings — default feature flags (DD-010)
  await db.insert(appSettings).values([
    { key: 'feedback.enabled', value: true, description: 'Enable user feedback system' },
    { key: 'feedback.ai_review', value: true, description: 'AI reviews feedback before save' },
    { key: 'feedback.auto_attach_debug', value: true, description: 'Auto-attach Claude debug log' },
    { key: 'telemetry.enabled', value: true, description: 'Enable telemetry tracking' },
    { key: 'telemetry.compliance_scoring', value: false, description: 'Enable compliance scoring' },
    { key: 'chat.enabled', value: true, description: 'Enable Claude chat panel' },
    { key: 'chat.batch_generation', value: true, description: 'Enable batch change generation' },
    { key: 'notifications.enabled', value: true, description: 'Enable notification system' },
    { key: 'changelog.explain_feature', value: true, description: 'Enable AI change explanations' },
    { key: 'debug_agent.enabled', value: true, description: 'Enable debug agent scoring' },
    { key: 'debug_agent.auto_resolve', value: false, description: 'Enable auto-fix (opt-in)' },
    { key: 'debug_agent.confidence_threshold', value: 10, description: 'Auto-resolve threshold (out of 12)' },
    { key: 'backups.enabled', value: true, description: 'Enable backup utilities' },
    { key: 'onboarding.enabled', value: true, description: 'Enable getting started page' },
    { key: 'active_users.broadcast_enabled', value: true, description: 'Enable broadcast messaging' },
    { key: 'archive.cascade_enabled', value: true, description: 'Cascade archive to children' },
  ]).onConflictDoNothing();

  // Screen Inventory — template screens (Section 7)
  await db.insert(screenInventory).values([
    { screenKey: 'login', name: 'Login', routePattern: '/login', sortOrder: 0 },
    { screenKey: 'getting-started', name: 'Getting Started', routePattern: '/getting-started', sortOrder: 1 },
    { screenKey: 'home', name: 'Home Dashboard', routePattern: '/', sortOrder: 2 },
    { screenKey: 'entities', name: 'Entities', routePattern: '/entities', sortOrder: 3, description: 'Sample domain entity list — adopter replaces' },
    { screenKey: 'change-log', name: 'Change Log', routePattern: '/change-log', sortOrder: 4 },
    { screenKey: 'admin-settings', name: 'Admin: Settings', routePattern: '/admin/settings', sortOrder: 10 },
    { screenKey: 'admin-telemetry', name: 'Admin: Telemetry', routePattern: '/admin/telemetry', sortOrder: 11 },
    { screenKey: 'admin-feedback', name: 'Admin: Feedback Triage', routePattern: '/admin/feedback', sortOrder: 12 },
    { screenKey: 'admin-prompts', name: 'Admin: Prompt Admin', routePattern: '/admin/prompts', sortOrder: 13 },
    { screenKey: 'admin-active-users', name: 'Admin: Active Users', routePattern: '/admin/active-users', sortOrder: 14 },
    { screenKey: 'sysadmin-database', name: 'Sysadmin: Database Views', routePattern: '/sysadmin/database', sortOrder: 20 },
    { screenKey: 'sysadmin-jobs', name: 'Sysadmin: System Jobs', routePattern: '/sysadmin/jobs', sortOrder: 21 },
    { screenKey: 'sysadmin-backups', name: 'Sysadmin: Backups', routePattern: '/sysadmin/backups', sortOrder: 22 },
  ]).onConflictDoNothing();

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
