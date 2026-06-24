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

export async function startCronJobs(db: DrizzleClient): Promise<void> {
  if (cronStarted) return;
  cronStarted = true;

  let cron: any;
  try {
    // @ts-expect-error node-cron is an optional peer dep, imported dynamically
    cron = await import('node-cron');
  } catch {
    console.log('[Job-Runner] node-cron not installed — cron scheduling disabled. Install with: npm install node-cron');
    return;
  }

  for (const job of registry.values()) {
    if (job.jobType === 'cron' && job.cronExpression) {
      cron.schedule(job.cronExpression, async () => {
        console.log(`[Job-Runner] Cron firing: ${job.name}`);
        try {
          await runJob(db, job.name, 'cron');
        } catch (err: any) {
          console.error(`[Job-Runner] Cron job ${job.name} failed:`, err.message);
        }
      });
      console.log(`[Job-Runner] Cron scheduled: ${job.name} — ${job.cronExpression}`);
    }
  }
}

// ── Built-in example jobs (adopter can remove or add more) ────
// These demonstrate the pattern. Real adopters replace with their domain jobs.

export function registerBuiltInJobs(): void {
  registerJob({
    name: 'db-vacuum',
    label: 'DB Vacuum',
    description: 'Run VACUUM ANALYZE on all tables to reclaim space and update statistics',
    color: '#2563eb',
    jobType: 'manual',
    handler: async () => {
      // Note: this is a no-op placeholder. Real implementation needs raw pool access.
      // Adopters should replace with their actual vacuum logic.
      return { affected: 0, details: 'VACUUM ANALYZE completed (placeholder — wire up pool access for real execution)' };
    },
  });

  registerJob({
    name: 'cleanup-expired-sessions',
    label: 'Cleanup Sessions',
    description: 'Remove expired session records from the session store',
    color: '#059669',
    jobType: 'manual',
    handler: async () => {
      return { affected: 0, details: 'Session cleanup completed (placeholder — wire up session store for real execution)' };
    },
  });

  registerJob({
    name: 'recompute-stats',
    label: 'Recompute Stats',
    description: 'Recalculate cached statistics and aggregated counters',
    color: '#7c3aed',
    jobType: 'manual',
    handler: async () => {
      return { affected: 0, details: 'Stats recomputed (placeholder — wire up your stats logic)' };
    },
  });
}
