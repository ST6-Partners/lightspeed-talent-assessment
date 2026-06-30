// ============================================================
// DOCUMENT INDEX ROUTER — live list of the module's design docs
// Reads from Dropbox on each call (always current). Admin-only.
// ============================================================

import { router, protectedProcedure } from '../trpc.js';
import { requireAdmin } from '../services/permissions.js';
import { isDropboxConfigured, listModuleDocs, type DocGroup } from '../services/dropboxDocs.js';

export const docIndexRouter = router({
  list: protectedProcedure.use(requireAdmin).query(async () => {
    if (!isDropboxConfigured()) {
      return { configured: false, groups: [] as DocGroup[], error: null as string | null };
    }
    try {
      const groups = await listModuleDocs();
      return { configured: true, groups, error: null as string | null };
    } catch (err: any) {
      return { configured: true, groups: [] as DocGroup[], error: (err?.message ?? 'Failed to read Dropbox') as string | null };
    }
  }),
});
