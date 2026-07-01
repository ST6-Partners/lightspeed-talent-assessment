// ============================================================
// WORK SAMPLE RESOLVER
// Given a candidate, find the work sample from the Work Sample
// library that matches their department (via requisition), so the
// emailed work sample + the candidate page both use curated library
// content instead of free-text job-description instructions.
// Deterministic: the earliest-created Live task for the department.
// Returns null if nothing matches (caller falls back to the JD text).
// ============================================================

import { eq, and, asc } from 'drizzle-orm';
import { jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { departments } from '../db/schema/departments.js';
import { assessmentTasks } from '../db/schema/assessmentTasks.js';

export interface ResolvedWorkSample {
  title: string;
  instructions: string; // plain text with newlines (brief + show-your-work)
}

export async function resolveDeptWorkSample(
  db: any,
  candidate: { jdId?: string | null },
): Promise<ResolvedWorkSample | null> {
  if (!candidate?.jdId) return null;

  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) });
  if (!jd) return null;

  // 1) Prefer the task explicitly associated with this job description.
  if (jd.workSampleTaskId) {
    const chosen = await db.query.assessmentTasks.findFirst({ where: eq(assessmentTasks.id, jd.workSampleTaskId) });
    if (chosen) return compose(chosen);
  }

  // 2) Otherwise fall back to the department's Live library task.
  if (!jd.reqId) return null;

  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) });
  const deptName = req?.department?.trim();
  if (!deptName) return null;

  const dept = await db.query.departments.findFirst({ where: eq(departments.name, deptName) });
  if (!dept) return null;

  const task = await db.query.assessmentTasks.findFirst({
    where: and(
      eq(assessmentTasks.departmentId, dept.id),
      eq(assessmentTasks.status, 'Live'),
      eq(assessmentTasks.active, true),
    ),
    orderBy: [asc(assessmentTasks.createdAt)],
  });
  if (!task) return null;

  return compose(task);
}

function compose(task: any): ResolvedWorkSample {
  const brief = task.brief ?? '';
  const syw = task.showYourWorkInstructions ?? '';
  const instructions = syw ? `${brief}\n\n— Show your work —\n${syw}` : brief;
  return { title: task.title, instructions };
}
