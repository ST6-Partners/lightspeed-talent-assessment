// ============================================================
// PERMISSION SERVICE — single source of truth (DD-014)
// Used by BOTH tRPC routes AND Claude tool execution.
// Source: RCDO's services/hierarchyPermissions.js — translated to TypeScript.
// ============================================================

import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { middleware } from '../trpc.js';
import type { DrizzleClient } from '../db.js';
import { users } from '../db/schema/core.js';

export type RoleTier = 'user' | 'manager' | 'admin' | 'sysadmin';
export type PermissionAction = 'view' | 'edit' | 'create' | 'delete' | 'archive' | 'reassign';

const ROLE_HIERARCHY: Record<RoleTier, number> = {
  user: 1,
  manager: 2,
  admin: 3,
  sysadmin: 4,
};

/** Check if user's role meets the minimum required tier */
export function hasMinimumRole(userRole: RoleTier, requiredRole: RoleTier): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

/** Check if user is the owner of an entity */
export function isOwner(userId: string, entityOwnerId: string | null): boolean {
  return entityOwnerId !== null && userId === entityOwnerId;
}

/**
 * Full permission check — same logic for API routes AND Claude tools.
 * This is the "single source of truth" from RCDO DD-240.
 */
export async function checkPermission(
  db: DrizzleClient,
  userId: string,
  entityId: string | null,
  action: PermissionAction,
  context?: { entityType?: string; ownerId?: string | null }
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || !user.isActive) {
    return { allowed: false, reason: 'User not found or inactive' };
  }

  // Sysadmin/admin can do anything
  if (hasMinimumRole(user.role as RoleTier, 'admin')) {
    return { allowed: true };
  }

  // For mutations, check ownership
  if (['edit', 'delete', 'archive'].includes(action) && context?.ownerId !== undefined) {
    if (!isOwner(userId, context.ownerId)) {
      return { allowed: false, reason: `Only the owner can ${action} this item` };
    }
  }

  return { allowed: true };
}

/** tRPC middleware — wraps role check for route protection */
export const requireRole = (minRole: RoleTier) =>
  middleware(async ({ ctx, next }) => {
    const userRole = (ctx.user?.role || 'user') as RoleTier;
    if (!hasMinimumRole(userRole, minRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Requires ${minRole} role or higher`,
      });
    }
    return next();
  });

/** Convenience middleware shortcuts */
export const requireAuth = requireRole('user');
export const requireManager = requireRole('manager');
export const requireAdmin = requireRole('admin');
export const requireSysadmin = requireRole('sysadmin');

/**
 * Permission check for Claude tool execution (DD-016).
 * Same logic as API routes — this is what makes permission-mirrored AI work.
 */
export async function checkToolPermission(
  db: DrizzleClient,
  sessionUserId: string,
  toolName: string,
  toolPermissions: Record<string, RoleTier>
): Promise<{ allowed: boolean; reason?: string }> {
  const requiredRole = toolPermissions[toolName] || 'admin';
  const user = await db.query.users.findFirst({
    where: eq(users.id, sessionUserId),
  });

  if (!user || !hasMinimumRole(user.role as RoleTier, requiredRole)) {
    return { allowed: false, reason: `Tool ${toolName} requires ${requiredRole} role` };
  }

  return { allowed: true };
}
