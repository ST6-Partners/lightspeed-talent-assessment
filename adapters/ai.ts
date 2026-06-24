// ============================================================
// AI ADAPTER — Claude tool definitions and context injection (DD-014)
// Source: RCDO server-routes-chat.js buildContextInjection() pattern
// ============================================================

import type { RoleTier } from '../server/src/services/permissions.js';

/** Entity context — injected into every Claude turn */
export interface EntityContext {
  entityId: string;
  entityType: string;
  entityLabel: string;
  screenContext: string;
  parentId?: string;
  parentLabel?: string;
  additionalContext?: Record<string, unknown>;
}

/** Full screen state snapshot — returned by contextProvider */
export interface ScreenContextSnapshot {
  entity: EntityContext | null;
  screen: string;
  route: string;
  filters: Record<string, string>;
  user: { id: string; role: string };
  timestamp: string;
}

/** Tool definition with permission-mirrored execution (DD-016) */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredPermission: RoleTier;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  userId: string;
  userRole: RoleTier;
  db: any; // DrizzleClient
  entityContext: EntityContext | null;
}

/** Default context provider — adopters extend with domain-specific context */
export type ContextProvider = () => ScreenContextSnapshot;

// Example tool definitions — adopters replace with domain tools
export const defaultToolPermissions: Record<string, RoleTier> = {
  'entity.list': 'user',
  'entity.create': 'user',
  'entity.update': 'user',
  'entity.delete': 'manager',
  'admin.updateSettings': 'admin',
  'sysadmin.runBackup': 'sysadmin',
};
