// ============================================================
// JOB RUNNER — Configurable scheduled + manual job execution
// Replicates RCDO scheduled-jobs.js pattern for SP-002
//
// Adopters register jobs at startup. Each job has:
//   - name, description, color (for UI badge)
//   - handler function (async, returns { affected, details })
//   - optional cron schedule (node-cron expression)
//
// Every run (cron or manual) is logged to system_jobs table.
// The frontend reads run history and can trigger jobs manually.
// ============================================================

import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleClient } from '../db.js';
import { systemJobs } from '../db/schema/system.js';

// ── Types ─────────────────────────────────────────────────────

export interface JobResult {
  affected: number;
  details?: string;
  error?: string;
}

export interface RegisteredJob {
  name: string;
  label: string;
  description: string;
  color: string;              // hex color for UI button
  jobType: 'cron' | 'manual'; // cron = scheduled + manual, manual = manual-only
  cronExpression?: string;     // node-cron expression (if cron type)
  handler: (opts: { force?: boolean }) => Promise<JobResult>;
}

interface JobRunRecord {
  id: string;
  jobName: string;
  jobType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  output: any;
  error: string | null;
  createdAt: string;
}

// ── Job Registry ──────────────────────────────────────────────

const registry = new Map<string, RegisteredJob>();

export function registerJob(job: RegisteredJob): void {
  if (registry.has(job.name)) {
    console.warn(`[Job-Runner] Job "${job.name}" already registered — overwriting`);
  }
  registry.set(job.name, job);
  console.log(`[Job-Runner] Registered: ${job.name} (${job.jobType}${job.cronExpression ? ` — ${job.cronExpression}` : ''})`);
}

export function getRegisteredJobs(): Array<Omit<RegisteredJob, 'handler'>> {
  return Array.from(registry.values()).map(({ handler, ...rest }) => rest);
}

// ── Run a job (manual or cron) ────────────────────────────────

export async function runJob(
  db: DrizzleClient,
  jobName: string,
  trigger: 'manual' | 'cron' = 'manual',
  initiatedBy?: string,
): Promise<{ success: boolean; run: any }> {
  const job = registry.get(jobName);
  if (!job) {
    throw new Error(`Unknown job: ${jobName}. Registered: ${Array.from(registry.keys()).join(', ')}`);
  }

  const startTime = Date.now();

  // Insert a "running" record
  const [runRecord] = await db
    .insert(systemJobs)
    .values({
      jobName: job.name,
      jobType: trigger,
      status: 'running',
      startedAt: new Date(),
      initiatedBy: initiatedBy || null,
    })
    .returning();

  try {
    const result = await job.handler({ force: trigger === 'manual' });
    const durationMs = Date.now() - startTime;

    // Update to success
    const [updated] = await db
      .update(systemJobs)
      .set({
        status: result.error ? 'fail' : 'success',
        completedAt: new Date(),
        durationMs,
        output: {
          affected: result.affected,
          details: result.details || null,
        },
        error: result.error || null,
      })
      .where(eq(systemJobs.id, runRecord.id))
      .returning();

    return { success: !result.error, run: updated };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Update to fail
    const [updated] = await db
      .update(systemJobs)
      .set({
        status: 'fail',
        completedAt: new Date(),
        durationMs,
        error: err.message || 'Unknown error',
      })
      .where(eq(systemJobs.id, runRecord.id))
      .returning();

    return { success: false, run: updated };
  }
}

// ── Query run history ─────────────────────────────────────────

export async function listJobRuns(
  db: DrizzleClient,
  opts: { limit?: number; jobName?: string } = {},
): Promise<{ runs: any[]; total: number }> {
  const limit = opts.limit ?? 50;

  const base = opts.jobName
    ? db.select().from(systemJobs).where(eq(systemJobs.jobName, opts.jobName))
    : db.select().from(systemJobs);

  const rows = await base
    .orderBy(desc(systemJobs.startedAt))
    .limit(limit);
  return { runs: rows, total: rows.length };
}

// ── Cron scheduling (optional — requires node-cron) ───────────
// Adopters can call startCronJobs() after registering jobs.
// If node-cron isn't installed, cron scheduling is a no-op.

let cronStarted = false;

// node-cron module + db handle captured at startup so jobs can be
// (re)scheduled dynamically later — e.g. when an admin changes a report's
// send day/time. cronTasks holds the live ScheduledTask per job so we can
// stop and replace it without a restart.
let cronMod: any = null;
let cronDbRef: DrizzleClient | null = null;
const cronTasks = new Map<string, any>();

function scheduleCronTask(jobName: string, cronExpression: string): boolean {
  if (!cronMod || !cronDbRef) return false;
  if (typeof cronMod.validate === 'function' && !cronMod.validate(cronExpression)) {
    console.warn(`[Job-Runner] Invalid cron "${cronExpression}" for ${jobName} — keeping previous schedule`);
    return false;
  }
  const prev = cronTasks.get(jobName);
  if (prev) { try { prev.stop(); } catch { /* ignore */ } cronTasks.delete(jobName); }
  const dbRef = cronDbRef;
  const task = cronMod.schedule(cronExpression, async () => {
    console.log(`[Job-Runner] Cron firing: ${jobName}`);
    try {
      await runJob(dbRef, jobName, 'cron');
    } catch (err: any) {
      console.error(`[Job-Runner] Cron job ${jobName} failed:`, err.message);
    }
  });
  cronTasks.set(jobName, task);
  console.log(`[Job-Runner] Cron scheduled: ${jobName} — ${cronExpression}`);
  return true;
}

// Stop + reschedule a single registered job under a new cron expression,
// without a restart. Returns false if cron isn't available or the
// expression is invalid (previous schedule is kept in that case).
export function rescheduleCronJob(jobName: string, cronExpression: string): boolean {
  return scheduleCronTask(jobName, cronExpression);
}

export async function startCronJobs(db: DrizzleClient): Promise<void> {
  if (cronStarted) return;
  cronStarted = true;

  try {
    // @ts-expect-error node-cron is an optional peer dep, imported dynamically
    cronMod = await import('node-cron');
  } catch {
    console.log('[Job-Runner] node-cron not installed — cron scheduling disabled. Install with: npm install node-cron');
    return;
  }
  cronDbRef = db;

  for (const job of registry.values()) {
    if (job.jobType === 'cron' && job.cronExpression) {
      scheduleCronTask(job.name, job.cronExpression);
    }
  }
}

// ── Built-in example jobs (adopter can remove or add more) ────
// These demonstrate the pattern. Real adopters replace with their domain jobs.

export function registerBuiltInJobs(): void {
  // The generic template maintenance jobs (db-vacuum, cleanup-expired-sessions,
  // recompute-stats) were no-op placeholders that reported success without doing
  // anything, so they were removed to avoid misleading the admin. The real hiring
  // jobs are registered by hiring-scheduler (registerHiringJobs). Re-add real
  // maintenance jobs here when they're actually implemented.
}
