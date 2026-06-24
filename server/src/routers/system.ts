// ============================================================
// SYSTEM ROUTER — system jobs, backups, database admin, active users (sysadmin)
// Tables: systemJobs, backupLog, users
// Database explorer: dbSchema, tableDetail, tableData (raw SQL)
// ============================================================

import { z } from 'zod';
import { eq, desc, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { systemJobs, backupLog } from '../db/schema/system.js';
import { users } from '../db/schema/core.js';
import { requireSysadmin } from '../services/permissions.js';
import { pool } from '../db.js';
import * as backupService from '../services/backup.js';
import * as jobRunner from '../services/job-runner.js';

export const systemRouter = router({
  // ── Job Runner endpoints ──────────────────────────────────────

  // List registered jobs (what CAN run)
  registeredJobs: protectedProcedure
    .use(requireSysadmin)
    .query(async () => {
      return jobRunner.getRegisteredJobs();
    }),

  // List job run history (what DID run) — with optional filter
  listJobRuns: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      jobName: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return jobRunner.listJobRuns(ctx.db, {
        limit: input?.limit ?? 50,
        jobName: input?.jobName,
      });
    }),

  // Manually trigger a registered job
  runJob: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      jobName: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await jobRunner.runJob(ctx.db, input.jobName, 'manual', ctx.user.id);
      } catch (err: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err.message,
        });
      }
    }),

  // Legacy: list raw system_jobs rows (kept for backward compat)
  listJobs: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const rows = await ctx.db
        .select()
        .from(systemJobs)
        .orderBy(desc(systemJobs.createdAt))
        .limit(limit);

      return rows;
    }),

  listBackups: protectedProcedure
    .use(requireSysadmin)
    .query(async ({ ctx }) => {
      const rows = await ctx.db
        .select({
          id: backupLog.id,
          systemJobId: backupLog.systemJobId,
          jobName: systemJobs.jobName,
          backupType: backupLog.backupType,
          tablesIncluded: backupLog.tablesIncluded,
          fileSizeBytes: backupLog.fileSizeBytes,
          filePath: backupLog.filePath,
          status: backupLog.status,
          initiatedBy: backupLog.initiatedBy,
          createdAt: backupLog.createdAt,
        })
        .from(backupLog)
        .leftJoin(systemJobs, eq(backupLog.systemJobId, systemJobs.id))
        .orderBy(desc(backupLog.createdAt));

      return rows;
    }),

  dbStats: protectedProcedure
    .use(requireSysadmin)
    .query(async ({ ctx }) => {
      const result = await ctx.db.execute(sql`
        SELECT schemaname, relname as table_name, n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `);

      return result.rows as Array<{ schemaname: string; table_name: string; row_count: number }>;
    }),

  activeUsers: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      minutes: z.number().int().min(1).max(1440).default(5),
    }).optional())
    .query(async ({ ctx, input }) => {
      const minutes = input?.minutes ?? 5;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);

      const rows = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          lastActiveAt: users.lastActiveAt,
        })
        .from(users)
        .where(sql`${users.isActive} = true AND ${users.lastActiveAt} > ${cutoff.toISOString()}`)
        .orderBy(desc(users.lastActiveAt));

      return { count: rows.length, minutes, users: rows };
    }),

  // Database explorer: list all tables with row counts
  dbSchema: protectedProcedure
    .use(requireSysadmin)
    .query(async ({ ctx }) => {
      const result = await ctx.db.execute(sql`
        SELECT t.table_name, COALESCE(s.n_live_tup, 0)::int as row_count
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name
      `);

      return result.rows as Array<{ table_name: string; row_count: number }>;
    }),

  // Database explorer: get detailed column/key/index info for a table
  tableDetail: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      tableName: z.string().min(1).max(255),
    }))
    .query(async ({ ctx, input }) => {
      const tableName = input.tableName;

      // Validate table exists to prevent SQL injection
      const tableExists = await ctx.db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `);

      if (tableExists.rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Table not found' });
      }

      // Get columns with details
      const columns = await ctx.db.execute(sql`
        SELECT c.column_name, c.data_type, c.character_maximum_length,
               c.is_nullable, c.column_default, c.ordinal_position
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = ${tableName}
        ORDER BY c.ordinal_position
      `);

      // Get primary key columns
      const pks = await ctx.db.execute(sql`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = ${tableName} AND tc.constraint_type = 'PRIMARY KEY'
      `);
      const pkSet = new Set(pks.rows.map(r => (r as any).column_name));

      // Get foreign keys
      const fks = await ctx.db.execute(sql`
        SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = ${tableName} AND tc.constraint_type = 'FOREIGN KEY'
      `);
      const fkMap: Record<string, { table: string; column: string }> = {};
      fks.rows.forEach(row => {
        const r = row as any;
        fkMap[r.column_name] = { table: r.foreign_table, column: r.foreign_column };
      });

      // Get indexes
      const indexes = await ctx.db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ${tableName}
      `);

      // Enrich columns with PK and FK info
      const enrichedColumns = columns.rows.map(col => {
        const c = col as any;
        return {
          column_name: c.column_name,
          data_type: c.data_type,
          character_maximum_length: c.character_maximum_length,
          is_nullable: c.is_nullable,
          column_default: c.column_default,
          ordinal_position: c.ordinal_position,
          is_primary_key: pkSet.has(c.column_name),
          foreign_key: fkMap[c.column_name] || null,
        };
      });

      return {
        table_name: tableName,
        columns: enrichedColumns,
        indexes: indexes.rows as Array<{ indexname: string; indexdef: string }>,
      };
    }),

  // Database explorer: paginated row data with search/sort
  // Uses validated identifiers in sql.raw() (safe after whitelist check)
  // and sql tagged templates for user-provided values
  tableData: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      tableName: z.string().min(1).max(255),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(50),
      sort: z.string().optional(),
      dir: z.enum(['asc', 'desc']).default('desc'),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { tableName, page, limit, sort, dir, search } = input;

      // CRITICAL: Validate table name exists to prevent SQL injection
      const validTablesResult = await ctx.db.execute(sql`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      `);
      const validTables = validTablesResult.rows.map((r: any) => r.table_name);

      if (!validTables.includes(tableName)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid table name' });
      }

      // Validate sort column if provided
      if (sort) {
        const colCheckResult = await ctx.db.execute(sql`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${sort}
        `);
        if (colCheckResult.rows.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid sort column' });
        }
      }

      // Build search condition using sql tagged templates for safe param binding
      let searchCondition = sql``;
      if (search) {
        const textColsResult = await ctx.db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${tableName}
          AND data_type IN ('text', 'character varying', 'uuid')
        `);

        if (textColsResult.rows.length > 0) {
          const textCols = textColsResult.rows.map((r: any) => r.column_name);
          const pattern = `%${search}%`;
          // Build OR chain: col1::text ILIKE $1 OR col2::text ILIKE $1 ...
          const conditions = textCols.map(
            (col: string) => sql.raw(`"${col}"::text ILIKE '${pattern.replace(/'/g, "''")}'`)
          );
          searchCondition = sql` WHERE (${sql.join(conditions, sql` OR `)})`;
        }
      }

      // Table name is validated above — safe to use in sql.raw()
      const tableRef = sql.raw(`"${tableName}"`);

      // Get total count
      const countResult = await ctx.db.execute(
        sql`SELECT COUNT(*) as count FROM ${tableRef}${searchCondition}`
      );
      const total = parseInt((countResult.rows[0] as any).count);

      // Build ORDER BY
      const orderClause = sort
        ? sql.raw(`ORDER BY "${sort}" ${dir} NULLS LAST`)
        : sql.raw(`ORDER BY 1 DESC`);

      // Get data with sort/pagination
      const offset = (page - 1) * limit;
      const dataResult = await ctx.db.execute(
        sql`SELECT * FROM ${tableRef}${searchCondition} ${orderClause} LIMIT ${limit} OFFSET ${offset}`
      );

      // Clean up binary and very long text for display
      const rows = dataResult.rows.map(row => {
        const r = row as any;
        const clean: Record<string, any> = {};
        for (const [key, val] of Object.entries(r)) {
          if (val instanceof Buffer || (val && typeof val === 'object' && (val as any).type === 'Buffer')) {
            clean[key] = `[binary]`;
          } else if (typeof val === 'string' && val.length > 500) {
            clean[key] = val.substring(0, 500) + '…';
          } else {
            clean[key] = val;
          }
        }
        return clean;
      });

      const pages = Math.ceil(total / limit);

      return { rows, total, page, limit, pages };
    }),

  // Database explorer: interactive ERD data (nodes + edges)
  // Returns structured graph data for SVG rendering on the frontend
  dbErd: protectedProcedure
    .use(requireSysadmin)
    .query(async ({ ctx }) => {
      // All tables
      const tablesResult = await ctx.db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      // All columns with types
      const columnsResult = await ctx.db.execute(sql`
        SELECT table_name, column_name, data_type, is_nullable, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      // Primary keys
      const pksResult = await ctx.db.execute(sql`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      `);
      const pkMap = new Map<string, Set<string>>();
      pksResult.rows.forEach((r: any) => {
        if (!pkMap.has(r.table_name)) pkMap.set(r.table_name, new Set());
        pkMap.get(r.table_name)!.add(r.column_name);
      });

      // Foreign keys
      const fksResult = await ctx.db.execute(sql`
        SELECT kcu.table_name AS from_table, kcu.column_name AS from_column,
               ccu.table_name AS to_table, ccu.column_name AS to_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      `);

      // Row counts
      const countsResult = await ctx.db.execute(sql`
        SELECT relname AS table_name, n_live_tup AS row_count
        FROM pg_stat_user_tables WHERE schemaname = 'public'
      `);
      const countMap = new Map<string, number>();
      countsResult.rows.forEach((r: any) => {
        countMap.set(r.table_name, parseInt(r.row_count));
      });

      // Assemble per-table columns
      const colsByTable = new Map<string, any[]>();
      columnsResult.rows.forEach((c: any) => {
        if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
        colsByTable.get(c.table_name)!.push({
          name: c.column_name,
          type: c.data_type + (c.character_maximum_length ? `(${c.character_maximum_length})` : ''),
          nullable: c.is_nullable === 'YES',
          pk: pkMap.get(c.table_name)?.has(c.column_name) || false,
        });
      });

      const nodes = tablesResult.rows.map((t: any) => ({
        name: t.table_name,
        columns: colsByTable.get(t.table_name) || [],
        row_count: countMap.get(t.table_name) || 0,
      }));

      const edges = fksResult.rows.map((fk: any) => ({
        from_table: fk.from_table,
        from_column: fk.from_column,
        to_table: fk.to_table,
        to_column: fk.to_column,
      }));

      return { nodes, edges };
    }),

  // ── Backup endpoints ────────────────────────────────────────

  // List all backups with metadata
  backupList: protectedProcedure
    .use(requireSysadmin)
    .query(async () => {
      return backupService.listBackups();
    }),

  // Create a manual backup
  backupCreate: protectedProcedure
    .use(requireSysadmin)
    .mutation(async () => {
      const result = await backupService.createBackup(pool, 'manual');
      const pruneResult = backupService.pruneBackups();
      return { ...result, pruned: pruneResult.pruned };
    }),

  // Delete a specific backup
  backupDelete: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({ filename: z.string().min(1) }))
    .mutation(async ({ input }) => {
      backupService.deleteBackup(input.filename);
      return { success: true };
    }),

  // Restore from a backup (creates safety backup first)
  backupRestore: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({ filename: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return await backupService.restoreBackup(pool, input.filename);
    }),

  // Manual prune
  backupPrune: protectedProcedure
    .use(requireSysadmin)
    .mutation(async () => {
      return backupService.pruneBackups();
    }),

  // ── Snapshot Export + Sync endpoints ─────────────────────────

  // Export snapshot (creates app-snapshot.db from current DB, optionally pushes to git)
  snapshotExport: protectedProcedure
    .use(requireSysadmin)
    .input(z.object({
      gitPush: z.boolean().default(true),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      return await backupService.exportSnapshot(pool, {
        userId: ctx.user.id,
        userName: ctx.user.name || ctx.user.email,
        gitPush: input?.gitPush ?? true,
      });
    }),

  // Check snapshot status
  snapshotInfo: protectedProcedure
    .use(requireSysadmin)
    .query(async () => {
      return backupService.getSnapshotInfo();
    }),

  // Pull latest snapshot from git
  snapshotPull: protectedProcedure
    .use(requireSysadmin)
    .mutation(async () => {
      return await backupService.pullSnapshot();
    }),

  // Preview: compare snapshot vs live DB
  snapshotPreview: protectedProcedure
    .use(requireSysadmin)
    .query(async () => {
      return await backupService.previewSnapshot(pool);
    }),

  // Execute snapshot sync (replace all data)
  snapshotSync: protectedProcedure
    .use(requireSysadmin)
    .mutation(async () => {
      return await backupService.executeSnapshotSync(pool);
    }),
});
