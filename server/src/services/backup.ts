// ============================================================
// BACKUP SERVICE — SQLite snapshot-based backup/restore
// Pattern: RCDO backup system (better-sqlite3 + retention policy)
// ============================================================

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');
const SNAPSHOT_PATH = path.join(PROJECT_ROOT, 'app-snapshot.db');

// Retention: 7 daily + 4 weekly
const RETENTION = { daily: 7, weekly: 4 };

// App prefix for backup filenames (adopter changes this)
const APP_PREFIX = 'tmpl-backup';

// Helper: convert JS values for SQLite storage
function sqliteValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

// Helper: generate CREATE TABLE SQL from Postgres metadata
async function getCreateTableSQL(pool: Pool, tableName: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );

  const colDefs = rows.map(r => {
    let type = 'TEXT';
    if (['integer', 'bigint', 'smallint'].includes(r.data_type)) type = 'INTEGER';
    else if (['numeric', 'double precision', 'real'].includes(r.data_type)) type = 'REAL';
    else if (r.data_type === 'boolean') type = 'INTEGER';
    return `"${r.column_name}" ${type}`;
  });

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')})`;
}

// Helper: format file size
function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

/**
 * Get all table names from the public schema
 */
export async function getTableNames(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return rows.map(r => r.table_name);
}

/**
 * Get FK-safe truncate order (leaves first)
 */
export async function getTruncateOrder(pool: Pool): Promise<string[]> {
  const tables = await getTableNames(pool);

  // Get FK dependencies
  const { rows: fks } = await pool.query(`
    SELECT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
  `);

  // Topological sort — children before parents (for truncation)
  const deps = new Map<string, Set<string>>();
  tables.forEach(t => deps.set(t, new Set()));
  fks.forEach(fk => {
    if (deps.has(fk.child) && deps.has(fk.parent) && fk.child !== fk.parent) {
      deps.get(fk.parent)!.add(fk.child); // parent depends on child being truncated first
    }
  });

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(node: string) {
    if (visited.has(node)) return;
    if (visiting.has(node)) return; // cycle — skip
    visiting.add(node);
    for (const dep of deps.get(node) || []) visit(dep);
    visiting.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  tables.forEach(t => visit(t));
  return sorted; // children first — safe for TRUNCATE
}

/**
 * Create a SQLite backup of the entire Postgres database
 */
export async function createBackup(pool: Pool, trigger: string = 'manual') {
  // Ensure backup dir exists
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${APP_PREFIX}-${ts}.db`;
  const filepath = path.join(BACKUP_DIR, filename);

  const db = new Database(filepath);
  db.pragma('journal_mode = WAL');

  const tableNames = await getTableNames(pool);

  // Create tables dynamically from Postgres schema
  for (const table of tableNames) {
    const createSQL = await getCreateTableSQL(pool, table);
    db.exec(createSQL);
  }

  // Export each table
  let totalRows = 0;
  const tableCounts: Record<string, number> = {};

  for (const table of tableNames) {
    // Skip BYTEA columns (binary data)
    const { rows: colInfo } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND data_type = 'bytea'`,
      [table]
    );
    const byteaCols = colInfo.map(r => r.column_name);

    let query = `SELECT * FROM "${table}"`;
    if (byteaCols.length > 0) {
      const { rows: allCols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      const safeCols = allCols.map(r => r.column_name).filter(c => !byteaCols.includes(c));
      query = `SELECT ${safeCols.map(c => `"${c}"`).join(', ')} FROM "${table}"`;
    }

    const { rows } = await pool.query(query);
    if (rows.length === 0) { tableCounts[table] = 0; continue; }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const colList = columns.map(c => `"${c}"`).join(', ');
    const stmt = db.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);

    const insertMany = db.transaction((data: any[]) => {
      for (const row of data) {
        stmt.run(...columns.map(c => sqliteValue(row[c])));
      }
    });

    insertMany(rows);
    totalRows += rows.length;
    tableCounts[table] = rows.length;
  }

  // Add metadata table
  db.exec(`CREATE TABLE _backup_meta (key TEXT PRIMARY KEY, value TEXT)`);
  const exportedAt = now.toISOString();
  db.prepare(`INSERT INTO _backup_meta VALUES (?, ?)`).run('exported_at', exportedAt);
  db.prepare(`INSERT INTO _backup_meta VALUES (?, ?)`).run('total_rows', String(totalRows));
  db.prepare(`INSERT INTO _backup_meta VALUES (?, ?)`).run('tables', tableNames.join(','));
  db.prepare(`INSERT INTO _backup_meta VALUES (?, ?)`).run('trigger', trigger);
  db.prepare(`INSERT INTO _backup_meta VALUES (?, ?)`).run('table_counts', JSON.stringify(tableCounts));

  db.close();

  const stats = fs.statSync(filepath);
  const fileSizeBytes = stats.size;
  const fileSize = formatFileSize(fileSizeBytes);

  console.log(`[Backup] Created ${filename} — ${totalRows} rows, ${fileSize}, trigger: ${trigger}`);

  return {
    filename,
    exportedAt,
    totalRows,
    tableCount: tableNames.length,
    fileSize,
    fileSizeBytes,
    tableCounts,
    trigger,
  };
}

/**
 * List all backup files with metadata
 */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return { backups: [], retention: RETENTION };

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(APP_PREFIX) && f.endsWith('.db'))
    .sort()
    .reverse(); // newest first

  const backups = files.map(filename => {
    const filepath = path.join(BACKUP_DIR, filename);
    const stats = fs.statSync(filepath);
    const fileSizeBytes = stats.size;
    const fileSize = formatFileSize(fileSizeBytes);

    // Read metadata from SQLite
    let meta: Record<string, string> = {};
    try {
      const db = new Database(filepath, { readonly: true });
      const rows = db.prepare('SELECT key, value FROM _backup_meta').all() as Array<{ key: string; value: string }>;
      rows.forEach(r => { meta[r.key] = r.value; });
      db.close();
    } catch {
      // Corrupted or missing meta — use file info
    }

    return {
      filename,
      createdAt: meta.exported_at || stats.birthtime.toISOString(),
      trigger: meta.trigger || 'unknown',
      totalRows: meta.total_rows ? parseInt(meta.total_rows) : null,
      tableCount: meta.tables ? meta.tables.split(',').length : null,
      fileSize,
      fileSizeBytes,
      tableCounts: meta.table_counts ? JSON.parse(meta.table_counts) : null,
    };
  });

  return { backups, retention: RETENTION };
}

/**
 * Prune old backups per retention policy
 */
export function pruneBackups(): { pruned: number; kept: number } {
  if (!fs.existsSync(BACKUP_DIR)) return { pruned: 0, kept: 0 };

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(APP_PREFIX) && f.endsWith('.db'))
    .sort()
    .reverse();

  if (files.length <= RETENTION.daily) return { pruned: 0, kept: files.length };

  const dailyKeep = new Set(files.slice(0, RETENTION.daily));

  const weeklyCandidates = files.slice(RETENTION.daily);
  const sundayKeep = new Set<string>();
  const seenWeeks = new Set<string>();
  for (const f of weeklyCandidates) {
    const match = f.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) continue;
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}`);
    if (sundayKeep.size < RETENTION.weekly) {
      const weekKey = `${d.getFullYear()}-W${Math.ceil((+d - +new Date(d.getFullYear(), 0, 1)) / 604800000)}`;
      if (!seenWeeks.has(weekKey)) {
        sundayKeep.add(f);
        seenWeeks.add(weekKey);
      }
    }
  }

  let pruned = 0;
  for (const f of files) {
    if (!dailyKeep.has(f) && !sundayKeep.has(f)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        pruned++;
      } catch (e: any) {
        console.warn(`[Backup] Failed to prune ${f}:`, e.message);
      }
    }
  }

  const kept = files.length - pruned;
  console.log(`[Backup] Pruned ${pruned} old backups, kept ${kept}`);
  return { pruned, kept };
}

/**
 * Delete a specific backup
 */
export function deleteBackup(filename: string): void {
  if (!/^[\w-]+\.db$/.test(filename)) throw new Error('Invalid filename');
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) throw new Error('Backup not found');
  fs.unlinkSync(filepath);
}

/**
 * Get backup filepath for download
 */
export function getBackupPath(filename: string): string {
  if (!/^[\w-]+\.db$/.test(filename)) throw new Error('Invalid filename');
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) throw new Error('Backup not found');
  return filepath;
}

/**
 * Restore database from a backup file.
 * Creates a pre-restore safety backup first.
 */
export async function restoreBackup(pool: Pool, filename: string) {
  if (!/^[\w-]+\.db$/.test(filename)) throw new Error('Invalid filename');
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) throw new Error('Backup not found');

  // Safety backup of current state
  const safetyResult = await createBackup(pool, 'pre-restore');

  // Open backup in read-only mode
  const db = new Database(filepath, { readonly: true });

  // Get tables from backup
  const backupTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%'"
  ).all() as Array<{ name: string }>;
  const tableNames = backupTables.map(t => t.name);

  // FK-safe truncation order
  const truncateOrder = await getTruncateOrder(pool);

  // Truncate in FK-safe order
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    // Truncate all matching tables
    for (const table of truncateOrder) {
      if (tableNames.includes(table)) {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
      }
    }

    // Insert in reverse order (parents first)
    const insertOrder = [...truncateOrder].reverse();
    let totalRestored = 0;
    let tablesRestored = 0;

    for (const table of insertOrder) {
      if (!tableNames.includes(table)) continue;

      const rows = db.prepare(`SELECT * FROM "${table}"`).all() as any[];
      if (rows.length === 0) { tablesRestored++; continue; }

      const columns = Object.keys(rows[0]);
      const colList = columns.map(c => `"${c}"`).join(', ');

      // Batch insert (100 rows at a time)
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const values: any[] = [];
        const valueSets: string[] = [];

        batch.forEach((row, batchIdx) => {
          const placeholders = columns.map((_, colIdx) => `$${batchIdx * columns.length + colIdx + 1}`);
          valueSets.push(`(${placeholders.join(', ')})`);
          columns.forEach(c => {
            let val = row[c];
            // Convert SQLite integers back to booleans where needed
            if (val === 0 || val === 1) {
              // Leave as-is — Postgres will handle int→bool coercion
            }
            values.push(val);
          });
        });

        await client.query(`INSERT INTO "${table}" (${colList}) VALUES ${valueSets.join(', ')}`, values);
      }

      totalRestored += rows.length;
      tablesRestored++;
    }

    await client.query('COMMIT');
    db.close();

    return {
      success: true,
      restoredRows: totalRestored,
      tablesRestored,
      sourceBackup: filename,
      safetyBackup: safetyResult.filename,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    db.close();
    throw err;
  } finally {
    client.release();
  }
}

// ── Snapshot Sync ────────────────────────────────────────────

/**
 * Preview: compare snapshot vs live database
 */
export async function previewSnapshot(pool: Pool) {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error('No snapshot file found. Export from production first, or run git pull.');
  }

  const db = new Database(SNAPSHOT_PATH, { readonly: true });

  // Read metadata
  let snapshotDate = 'unknown';
  let snapshotTotalRows = 0;
  try {
    const meta = db.prepare('SELECT key, value FROM _snapshot_meta').all() as Array<{ key: string; value: string }>;
    const metaMap: Record<string, string> = {};
    meta.forEach(r => { metaMap[r.key] = r.value; });
    snapshotDate = metaMap.exported_at || 'unknown';
    snapshotTotalRows = parseInt(metaMap.total_rows || '0');
  } catch {
    // No meta table — proceed with what we have
  }

  // Get snapshot tables
  const snapshotTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%'"
  ).all() as Array<{ name: string }>;
  const snapshotTableNames = new Set(snapshotTables.map(t => t.name));

  // Get live table row counts
  const liveTablesResult = await pool.query(`
    SELECT relname AS table_name, n_live_tup AS row_count
    FROM pg_stat_user_tables WHERE schemaname = 'public'
  `);
  const liveCountMap: Record<string, number> = {};
  let liveTotalRows = 0;
  liveTablesResult.rows.forEach(r => {
    liveCountMap[r.table_name] = parseInt(r.row_count);
    liveTotalRows += parseInt(r.row_count);
  });

  // Get all table names (union of snapshot + live)
  const allTables = await getTableNames(pool);

  // Compare
  const comparison = allTables.map(table => {
    const inSnapshot = snapshotTableNames.has(table);
    let snapshotRows = 0;
    if (inSnapshot) {
      try {
        const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as any;
        snapshotRows = countRow?.cnt || 0;
      } catch { /* table might not exist in snapshot */ }
    }
    const liveRows = liveCountMap[table] || 0;
    const delta = snapshotRows - liveRows;
    const action = inSnapshot ? (snapshotRows > 0 ? 'replace' : 'clear') : 'skip';

    return { table, in_snapshot: inSnapshot, snapshot_rows: snapshotRows, live_rows: liveRows, delta, action };
  });

  db.close();

  return {
    snapshot_date: snapshotDate,
    snapshot_total_rows: snapshotTotalRows,
    live_total_rows: liveTotalRows,
    tables_in_snapshot: snapshotTableNames.size,
    comparison,
  };
}

/**
 * Execute snapshot import — replace all data with snapshot
 */
export async function executeSnapshotSync(pool: Pool) {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error('No snapshot file found.');
  }

  const db = new Database(SNAPSHOT_PATH, { readonly: true });

  // Get snapshot tables
  const snapshotTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%'"
  ).all() as Array<{ name: string }>;
  const snapshotTableNames = snapshotTables.map(t => t.name);

  // FK-safe order
  const truncateOrder = await getTruncateOrder(pool);
  const insertOrder = [...truncateOrder].reverse();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    // Truncate
    for (const table of truncateOrder) {
      if (snapshotTableNames.includes(table)) {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
      }
    }

    // Insert
    let totalImported = 0;
    let tablesSynced = 0;
    let tablesSkipped = 0;
    let tablesErrored = 0;
    const results: Array<{ table: string; status: string; rows: number; reason?: string }> = [];

    for (const table of insertOrder) {
      if (!snapshotTableNames.includes(table)) {
        tablesSkipped++;
        results.push({ table, status: 'skipped', rows: 0, reason: 'not in snapshot' });
        continue;
      }

      try {
        const rows = db.prepare(`SELECT * FROM "${table}"`).all() as any[];
        if (rows.length === 0) {
          tablesSynced++;
          results.push({ table, status: 'ok', rows: 0 });
          continue;
        }

        const columns = Object.keys(rows[0]);
        const colList = columns.map(c => `"${c}"`).join(', ');

        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const values: any[] = [];
          const valueSets: string[] = [];

          batch.forEach((row, batchIdx) => {
            const placeholders = columns.map((_, colIdx) => `$${batchIdx * columns.length + colIdx + 1}`);
            valueSets.push(`(${placeholders.join(', ')})`);
            columns.forEach(c => values.push(row[c]));
          });

          await client.query(`INSERT INTO "${table}" (${colList}) VALUES ${valueSets.join(', ')}`, values);
        }

        totalImported += rows.length;
        tablesSynced++;
        results.push({ table, status: 'ok', rows: rows.length });
      } catch (err: any) {
        tablesErrored++;
        results.push({ table, status: 'error', rows: 0, reason: err.message });
      }
    }

    await client.query('COMMIT');
    db.close();

    return { success: true, total_imported: totalImported, tables_synced: tablesSynced, tables_skipped: tablesSkipped, tables_errored: tablesErrored, results };
  } catch (err) {
    await client.query('ROLLBACK');
    db.close();
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Export a snapshot of the current database to app-snapshot.db
 * Pattern: RCDO POST /api/admin/export-snapshot
 * Creates SQLite file with _snapshot_meta table containing export metadata.
 * Optionally commits + pushes to git (if git is available).
 */
export async function exportSnapshot(
  pool: Pool,
  opts: { userId?: string; userName?: string; gitPush?: boolean } = {},
): Promise<{
  success: boolean;
  exportedAt: string;
  totalRows: number;
  tableCount: number;
  fileSize: string;
  fileSizeBytes: number;
  tableCounts: Record<string, number>;
  gitCommit?: string;
}> {
  const now = new Date();
  const exportedAt = now.toISOString();

  // Remove old snapshot if it exists
  if (fs.existsSync(SNAPSHOT_PATH)) {
    fs.unlinkSync(SNAPSHOT_PATH);
  }

  const db = new Database(SNAPSHOT_PATH);
  db.pragma('journal_mode = WAL');

  const tableNames = await getTableNames(pool);

  // Create tables dynamically from Postgres schema
  for (const table of tableNames) {
    const createSQL = await getCreateTableSQL(pool, table);
    db.exec(createSQL);
  }

  // Export each table
  let totalRows = 0;
  const tableCounts: Record<string, number> = {};

  for (const table of tableNames) {
    // Skip BYTEA columns (binary data)
    const { rows: colInfo } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND data_type = 'bytea'`,
      [table]
    );
    const byteaCols = colInfo.map(r => r.column_name);

    let query = `SELECT * FROM "${table}"`;
    if (byteaCols.length > 0) {
      const { rows: allCols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position`,
        [table]
      );
      const safeCols = allCols.map(r => r.column_name).filter(c => !byteaCols.includes(c));
      query = `SELECT ${safeCols.map(c => `"${c}"`).join(', ')} FROM "${table}"`;
    }

    const { rows } = await pool.query(query);
    if (rows.length === 0) { tableCounts[table] = 0; continue; }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const colList = columns.map(c => `"${c}"`).join(', ');
    const stmt = db.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);

    const insertMany = db.transaction((data: any[]) => {
      for (const row of data) {
        stmt.run(...columns.map(c => sqliteValue(row[c])));
      }
    });

    insertMany(rows);
    totalRows += rows.length;
    tableCounts[table] = rows.length;
  }

  // Add _snapshot_meta table (RCDO pattern — underscore prefix = internal)
  db.exec(`CREATE TABLE _snapshot_meta (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('exported_at', exportedAt);
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('total_rows', String(totalRows));
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('tables', tableNames.join(','));
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('table_counts', JSON.stringify(tableCounts));
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('exported_by', opts.userName || 'system');
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('exported_by_id', opts.userId || '');
  db.prepare(`INSERT INTO _snapshot_meta VALUES (?, ?)`).run('app', APP_PREFIX);

  db.close();

  const stats = fs.statSync(SNAPSHOT_PATH);
  const fileSizeBytes = stats.size;
  const fileSize = formatFileSize(fileSizeBytes);

  console.log(`[Snapshot] Exported app-snapshot.db — ${totalRows} rows across ${tableNames.length} tables, ${fileSize}`);

  // Git commit + push (optional, matches RCDO pattern)
  let gitCommit: string | undefined;
  if (opts.gitPush !== false) {
    try {
      const { execSync } = await import('child_process');
      const gitOpts = { cwd: PROJECT_ROOT, encoding: 'utf-8' as const, timeout: 30000 };

      // Check if we're in a git repo
      try { execSync('git rev-parse --is-inside-work-tree', gitOpts); } catch { /* not a git repo — skip */ }

      execSync('git add app-snapshot.db', gitOpts);

      // Check if there's actually a change to commit
      const diff = execSync('git diff --cached --name-only', gitOpts).trim();
      if (diff.includes('app-snapshot.db')) {
        const commitMsg = `Snapshot export — ${now.toISOString().slice(0, 16)} by ${opts.userName || 'system'}`;
        execSync(`git commit -m "${commitMsg}"`, gitOpts);
        gitCommit = execSync('git rev-parse --short HEAD', gitOpts).trim();

        try {
          execSync('git push', { ...gitOpts, timeout: 60000 });
          console.log(`[Snapshot] Git commit ${gitCommit} pushed`);
        } catch (pushErr: any) {
          console.warn(`[Snapshot] Git push failed (commit ${gitCommit} is local):`, pushErr.message);
        }
      } else {
        console.log('[Snapshot] No changes to commit (snapshot identical to previous)');
      }
    } catch (gitErr: any) {
      console.warn('[Snapshot] Git operations skipped:', gitErr.message);
    }
  }

  return {
    success: true,
    exportedAt,
    totalRows,
    tableCount: tableNames.length,
    fileSize,
    fileSizeBytes,
    tableCounts,
    gitCommit,
  };
}

/**
 * Pull latest snapshot from git (for dev environments syncing from production)
 */
export async function pullSnapshot(): Promise<{ success: boolean; message: string; updated: boolean }> {
  try {
    const { execSync } = await import('child_process');
    const gitOpts = { cwd: PROJECT_ROOT, encoding: 'utf-8' as const, timeout: 60000 };

    // Check if git repo exists
    try { execSync('git rev-parse --is-inside-work-tree', gitOpts); } catch {
      return { success: false, message: 'Not a git repository', updated: false };
    }

    // Get current snapshot hash (if exists)
    let beforeHash = '';
    try {
      beforeHash = execSync('git hash-object app-snapshot.db', gitOpts).trim();
    } catch { /* file doesn't exist yet */ }

    // Pull
    execSync('git pull', gitOpts);

    // Check if snapshot changed
    let afterHash = '';
    try {
      afterHash = execSync('git hash-object app-snapshot.db', gitOpts).trim();
    } catch { /* still doesn't exist */ }

    if (!afterHash) {
      return { success: true, message: 'Git pull completed but no snapshot file found in repo', updated: false };
    }

    const updated = beforeHash !== afterHash;
    return {
      success: true,
      message: updated ? 'Pulled latest snapshot — file updated' : 'Already up to date',
      updated,
    };
  } catch (err: any) {
    return { success: false, message: `Git pull failed: ${err.message}`, updated: false };
  }
}

/**
 * Check if snapshot file exists and return metadata
 */
export function getSnapshotInfo(): { exists: boolean; date?: string; totalRows?: number; fileSize?: string; exportedBy?: string } {
  if (!fs.existsSync(SNAPSHOT_PATH)) return { exists: false };

  try {
    const db = new Database(SNAPSHOT_PATH, { readonly: true });
    const meta = db.prepare('SELECT key, value FROM _snapshot_meta').all() as Array<{ key: string; value: string }>;
    const metaMap: Record<string, string> = {};
    meta.forEach(r => { metaMap[r.key] = r.value; });
    db.close();

    const stats = fs.statSync(SNAPSHOT_PATH);
    return {
      exists: true,
      date: metaMap.exported_at,
      totalRows: parseInt(metaMap.total_rows || '0'),
      fileSize: formatFileSize(stats.size),
      exportedBy: metaMap.exported_by || undefined,
    };
  } catch {
    return { exists: true };
  }
}
