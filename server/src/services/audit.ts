// ============================================================
// AUDIT SERVICE — per-field change logging (SC-012)
// Source: RCDO's change_log pattern from Entity Inventory v1
// ============================================================

import type { DrizzleClient } from '../db.js';
import { changeLog } from '../db/schema/audit.js';

/**
 * Log a single change to the immutable change_log table.
 * Called by tRPC routes AND Claude tool handlers (same audit trail).
 */
export async function auditChange(
  db: DrizzleClient,
  userId: string,
  entityId: string,
  entityType: string,
  action: 'create' | 'update' | 'archive' | 'delete',
  fieldChange?: { field: string; oldValue: string | null; newValue: string | null } | null,
  batchId?: string
): Promise<void> {
  await db.insert(changeLog).values({
    userId,
    entityId,
    entityType,
    action,
    field: fieldChange?.field || null,
    oldValue: fieldChange?.oldValue || null,
    newValue: fieldChange?.newValue || null,
    batchId: batchId || null,
  });
}

/**
 * Log per-field changes for an update — compares old and new objects.
 * RCDO pattern: one change_log entry per changed field.
 */
export async function auditFieldChanges(
  db: DrizzleClient,
  userId: string,
  entityId: string,
  entityType: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  batchId?: string
): Promise<void> {
  for (const [field, newVal] of Object.entries(newValues)) {
    if (oldValues[field] !== newVal && newVal !== undefined) {
      await auditChange(db, userId, entityId, entityType, 'update', {
        field,
        oldValue: oldValues[field] != null ? String(oldValues[field]) : null,
        newValue: newVal != null ? String(newVal) : null,
      }, batchId);
    }
  }
}
