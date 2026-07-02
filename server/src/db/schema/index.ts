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

// Hiring Pipeline (5 tables)
export {
  jobRequisitions,
  jobDescriptions,
  candidates,
  candidateStageHistory,
  emailLog,
  candidateStageEnum,
  requisitionStatusEnum,
  jdStatusEnum,
  emailStatusEnum,
} from './hiring.js';
export { candidateReferences } from './hiring.js';

// Total: 28 tables (22 infrastructure + 1 sample domain + 5 hiring pipeline)

// Company Values (2 tables)
export { companyValues, candidateValueScores, valueReviews, valuePillarEnum } from './values.js';
export { employees } from './employees.js';
export { departments } from './departments.js';
export { titles } from './titles.js';

// EPP (1 table)
export { candidateEppScores } from './epp.js';

// Email (1 table) — inbound/test inbox
export { inboundEmails } from './email.js';

// Assessment Task Library + Assignments (curated work samples)
export { assessmentTasks, taskDifficultyEnum, taskStatusEnum } from './assessmentTasks.js';
export { assessmentPackages } from './assessmentPackages.js';

// Intake Form child tables (migration 0019)
export { interviewPlan, hiringTeam, awarenessList, approvals } from './intake.js';
