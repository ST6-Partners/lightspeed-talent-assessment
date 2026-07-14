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
import { emailTestRouter } from './routers/emailTest.js';
import { docIndexRouter } from './routers/docIndex.js';
// Hiring Pipeline
import { requisitionsRouter } from './routers/requisitions.js';
import { intakeRouter } from './routers/intake.js';
import { jobDescriptionsRouter } from './routers/jobDescriptions.js';
import { candidatesRouter } from './routers/candidates.js';
import { insightsRouter } from './routers/insights.js';
import { workSampleRouter } from './routers/workSample.js';
import { departmentsRouter } from './routers/departments.js';
import { assessmentTasksRouter } from './routers/assessmentTasks.js';
import { assessmentPackagesRouter } from './routers/assessmentPackages.js';
import { titlesRouter } from './routers/titles.js';
import { employeesRouter } from './routers/employees.js';
import { valuesRouter } from './routers/values.js';


import { internalOpeningsRouter } from './routers/internalOpenings.js';
import { schedulingRouter } from './routers/scheduling.js';
import { interviewsRouter } from './routers/interviews.js';
import { decisionsRouter } from './routers/decisions.js';
import { rankingRouter } from './routers/ranking.js';

export const appRouter = router({
  auth: authRouter,
  entity: sampleEntityRouter,
  admin: adminRouter,
  changelog: changelogRouter,
  notifications: notificationsRouter,
  telemetry: telemetryRouter,
  feedbackAdmin: feedbackAdminRouter,
  feedbackReview: feedbackReviewRouter,
  agent: agentRouter,
  feedbackApprove: feedbackApproveRouter,
  prompts: promptsRouter,
  system: systemRouter,
  releases: releasesRouter,
  onboardingVideos: onboardingVideosRouter,
  chat: chatRouter,
  emailTest: emailTestRouter,
  docIndex: docIndexRouter,
  // Hiring Pipeline
  requisitions: requisitionsRouter,
  intake: intakeRouter,
  jobDescriptions: jobDescriptionsRouter,
  candidates: candidatesRouter,
  insights: insightsRouter,
  workSample: workSampleRouter,
  internalOpenings: internalOpeningsRouter,
  scheduling: schedulingRouter,
  interviews: interviewsRouter,
  decisions: decisionsRouter,
  ranking: rankingRouter,
  departments: departmentsRouter,
  tasks: assessmentTasksRouter,
  packages: assessmentPackagesRouter,
  titles: titlesRouter,
  employees: employeesRouter,
  values: valuesRouter,
});

export type AppRouter = typeof appRouter;
