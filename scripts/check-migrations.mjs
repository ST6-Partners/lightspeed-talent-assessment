// Migration journal integrity guard.
// Fails the build if the Drizzle migration journal could silently skip a migration.
// Drizzle applies a migration only when its timestamp ("when") is greater than the
// newest already-applied one, so two migrations sharing a timestamp — or a new
// migration that isn't the strictly-highest timestamp — can be skipped with no error.
// See the 0023/0025 duplicate-timestamp incident and the offer-approval migration skip.
// It also flags NEW duplicate file-number prefixes (two "0023_*" etc.); the known
// historical duplicates are grandfathered because renaming applied migrations is unsafe.
import { readFileSync } from 'node:fs';

const path = 'server/drizzle/migrations/meta/_journal.json';
const journal = JSON.parse(readFileSync(path, 'utf8'));
const entries = journal.entries ?? [];
const errors = [];

// (a) No two migrations may share a timestamp.
const seen = new Map();
for (const e of entries) {
  if (seen.has(e.when)) {
    errors.push(`Duplicate timestamp ${e.when}: "${seen.get(e.when)}" and "${e.tag}"`);
  } else {
    seen.set(e.when, e.tag);
  }
}

// (b) The newest migration (last entry) must have the strictly-highest timestamp,
//     so a freshly added migration always applies incrementally.
if (entries.length > 1) {
  const last = entries[entries.length - 1];
  const maxOther = Math.max(...entries.slice(0, -1).map((e) => e.when));
  if (last.when <= maxOther) {
    errors.push(
      `Newest migration "${last.tag}" (when ${last.when}) is not the highest timestamp ` +
      `(highest existing is ${maxOther}). Bump its "when" above ${maxOther} or it may be skipped.`,
    );
  }
}

// (c) No two migrations may share a numeric file-number prefix (e.g. two "0023_*").
//     Once timestamps are unique this is harmless, but it is confusing and invites a
//     future clash. Known historical duplicates are grandfathered (renaming applied
//     migrations is unsafe); any NEW duplicate prefix fails the build.
const GRANDFATHERED_DUP_PREFIXES = new Set([]);
const byPrefix = new Map();
for (const e of entries) {
  const m = /^(\d+)/.exec(e.tag);
  if (!m) continue;
  const prefix = m[1];
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
  byPrefix.get(prefix).push(e.tag);
}
for (const [prefix, tags] of byPrefix) {
  if (tags.length <= 1) continue;
  if (GRANDFATHERED_DUP_PREFIXES.has(prefix)) {
    console.warn(`  note: migration number ${prefix} is reused by ${tags.length} files (${tags.join(', ')}) — grandfathered, harmless.`);
  } else {
    errors.push(`Duplicate migration number ${prefix}: ${tags.join(', ')}. Renumber the newer one to the next unused number.`);
  }
}

if (errors.length) {
  console.error('\nMigration journal check FAILED:\n' + errors.map((e) => '  - ' + e).join('\n') + '\n');
  process.exit(1);
}
console.log(`Migration journal OK (${entries.length} migrations, timestamps unique, newest is highest).`);
