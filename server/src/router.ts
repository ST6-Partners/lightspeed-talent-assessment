// ============================================================
// ROOT tRPC ROUTER — merges all sub-routers
// ============================================================

import { router } from './trpc.js';
import { authRouter } from './routers/auth.js';
import { sampleEntityRouter } from './routers/sampleEntity.js';
import { adminRouter } from './routers/admin.js';
import { changelogRouter } from './routers/changelog.js';
import { notificationsRouter } from './routers/notifications.js';
import { telemetryRouter } from './routers/telemetry.js';
import { feedbackAdminRouter } from './routers/feedbackAdmin.js';
import { feedbackReviewRouter } from './routers/feedbackReview.js';
import { agentRouter } from './routers/agent.js';
import { feedbackApproveRouter } from './routers/feedbackApprove.js';
import { promptsRouter } from './routers/prompts.js';
import { systemRouter } from './routers/system.js';
import { releasesRouter } from './routers/releases.js';
import { onboardingVideosRouter } from './routers/onboardingVideos.js';
import { chatRouter } from './routers/chat.js';

export const appRouter = router({
  auth: authRouter,
  entity: sampleEntityRouter,
  admin: adminRouter,
  changelog: changelogRouter,
  notifications: notificationsRouter,
  telemetry: telemetryRouter,
  feedbackAdmin: feedbackAdminRouter,
  feedbackReview: feedbackReviewRouter,   // pre-submit AI review (SC-002 / Contract §5)
  agent: agentRouter,
  feedbackApprove: feedbackApproveRouter,                     // propose-and-approve auto-fix harness (SC-034)
  prompts: promptsRouter,
  system: systemRouter,
  releases: releasesRouter,
  onboardingVideos: onboardingVideosRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
