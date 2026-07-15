// Migration journal integrity guard.
// Fails the build if the Drizzle migration journal could silently skip a migration.
// Drizzle applies a migration only when its timestamp ("when") is greater than the
// newest already-applied one, so two migrations sharing a timestamp — or a new
// migration that isn't the strictly-highest timestamp — can be skipped with no error.
// See the 0023/0025 duplicate-timestamp incident and the offer-approval migration skip.
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

if (errors.length) {
  console.error('\nMigration journal check FAILED:\n' + errors.map((e) => '  - ' + e).join('\n') + '\n');
  process.exit(1);
}
console.log(`Migration journal OK (${entries.length} migrations, timestamps unique, newest is highest).`);
