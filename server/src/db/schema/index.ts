// Schema barrel export — all tables
// Template App SP-002 scaffold

// Core (4 tables)
// Sessions are stored in Postgres via connect-pg-simple (the
// `auth_sessions` table, created on first run by getSessionMiddleware).
export { users, userPreferences, appSettings, screenInventory } from './core.js';

// Feedback (4 tables) — SC-002 feedback + AI review + agent (SC-034)
export { feedback, feedbackAttachments, feedbackReviewAttempts, agentRuns } from './feedback.js';

// Audit (2 tables)
export { changeLog, changeBatches } from './audit.js';

// Telemetry (3 tables)
export { userActivityLog, chatDebugLog, chatSessionLogs } from './telemetry.js';

// AI & Prompts (4 tables)
export { promptTemplates, designKnowledge, faqEntries, chatAttachments } from './ai.js';

// Notifications (2 tables)
export { notifications, releaseNotes } from './notifications.js';

// System Operations (3 tables)
export { systemJobs, backupLog, onboardingVideos } from './system.js';

// Sample Domain Entity (1 table) — adopters replace with their domain
export { sampleEntities } from './sampleEntity.js';

// Total: 23 tables (22 infrastructure + 1 sample domain)
