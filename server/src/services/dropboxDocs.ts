// ============================================================
// DROPBOX DOCS — live read of the module's design HTML docs
//
// Reads the AI Talent Assessment module's documents straight from Dropbox
// via the Dropbox HTTP API (OAuth refresh-token flow, no SDK), so the
// in-app Document Index is always current — no copies, no sync step.
// Mirrors the Command Center Dropbox integration.
//
// Required env (set in Railway): DROPBOX_APP_KEY, DROPBOX_APP_SECRET,
// DROPBOX_REFRESH_TOKEN. Optional: DROPBOX_DOCS_PATH (base folder).
// Falls back gracefully (configured:false) when not set.
// ============================================================

const DEFAULT_BASE =
  '/ST6 - Team/6-Innovation/Dreadnought/4-Lightspeed/AI Talent Assessment';

// Folders to scan, relative to the module base, with their display group.
const DOC_FOLDERS: Array<{ sub: string; group: string }> = [
  { sub: '1-User Summary', group: 'Overviews & Plans' },
  { sub: '2-Design', group: 'Design' },
  { sub: '2-Design/Mockups & Prototypes', group: 'Design' },
  { sub: 'x.working documents', group: 'Working Drafts' },
];

const GROUP_ORDER = ['Overviews & Plans', 'Design', 'Working Drafts'];

export interface DocItem { name: string; path: string; group: string }
export interface DocGroup { group: string; items: DocItem[] }

export function isDropboxConfigured(): boolean {
  return Boolean(
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET &&
    process.env.DROPBOX_REFRESH_TOKEN,
  );
}

function basePath(): string {
  return (process.env.DROPBOX_DOCS_PATH || DEFAULT_BASE).replace(/\/+$/, '');
}

// ── Access token (cached until shortly before expiry) ──
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const key = process.env.DROPBOX_APP_KEY!;
  const secret = process.env.DROPBOX_APP_SECRET!;
  const refresh = process.env.DROPBOX_REFRESH_TOKEN!;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh });
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text().catch(() => '')}`);
  const json: any = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 14400) * 1000 - 60_000 };
  return cachedToken.value;
}

interface DbxEntry { '.tag': string; name: string; path_display: string }

async function listFolder(path: string): Promise<DbxEntry[]> {
  const token = await getAccessToken();
  const entries: DbxEntry[] = [];
  let res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    // A missing folder shouldn't break the whole index.
    if (res.status === 409) return [];
    throw new Error(`Dropbox list_folder failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  let json: any = await res.json();
  entries.push(...json.entries);
  while (json.has_more) {
    res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: json.cursor }),
    });
    if (!res.ok) break;
    json = await res.json();
    entries.push(...json.entries);
  }
  return entries;
}

// Parse a trailing " vN" (the last one) to dedupe to the latest version.
function versionOf(name: string): { base: string; v: number } {
  const noExt = name.replace(/\.[a-z0-9]+$/i, '');
  const m = noExt.match(/^(.*?)[ -]v(\d+)\s*$/i);
  if (m) return { base: m[1].trim().toLowerCase(), v: Number(m[2]) };
  return { base: noExt.trim().toLowerCase(), v: 0 };
}

function prettyName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

/**
 * List the module's HTML documents, grouped, latest-version-only. Reads live
 * from Dropbox on every call, so it always reflects the current folder.
 */
export async function listModuleDocs(): Promise<DocGroup[]> {
  const base = basePath();
  const byGroup = new Map<string, Map<string, DocItem & { v: number }>>();

  for (const { sub, group } of DOC_FOLDERS) {
    let entries: DbxEntry[];
    try {
      entries = await listFolder(`${base}/${sub}`);
    } catch {
      continue; // skip folders that error; don't fail the whole index
    }
    for (const e of entries) {
      if (e['.tag'] !== 'file' || !/\.html?$/i.test(e.name)) continue;
      const { base: docBase, v } = versionOf(e.name);
      if (!byGroup.has(group)) byGroup.set(group, new Map());
      const m = byGroup.get(group)!;
      const existing = m.get(docBase);
      if (!existing || v >= existing.v) {
        m.set(docBase, { name: prettyName(e.name), path: e.path_display, group, v });
      }
    }
  }

  return GROUP_ORDER
    .filter((g) => byGroup.has(g))
    .map((g) => ({
      group: g,
      items: [...byGroup.get(g)!.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, path, group }) => ({ name, path, group })),
    }));
}

/** Download a single doc's content (HTML) for in-app serving. */
export async function readDoc(path: string): Promise<string> {
  const base = basePath();
  // Only allow paths inside the module base — never serve arbitrary Dropbox paths.
  if (!path.startsWith(base)) throw new Error('Path outside module base');
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path }) },
  });
  if (!res.ok) throw new Error(`Dropbox download failed (${res.status}): ${await res.text().catch(() => '')}`);
  return await res.text();
}
