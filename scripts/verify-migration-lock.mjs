// Applied migrations must never be edited, renamed or deleted (AGENTS.md).
// supabase/migrations.lock.json records a SHA-256 per migration file. This
// check fails when a recorded file changed or disappeared, or when a new file
// is not recorded yet. Record a NEW migration with: npm run migrations:lock
// (only after confirming it is new, never to accept an edit to an old one).
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'supabase/migrations');
const lockPath = resolve(root, 'supabase/migrations.lock.json');
const update = process.argv.includes('--update');

const hash = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
const current = Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(resolve(dir, f), 'utf8'))])));

let lock = {};
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch (error) {
  if (!update) throw new Error(`Missing ${lockPath}; run npm run migrations:lock once to create it. (${error.message})`);
}

const changed = Object.keys(lock).filter(f => f in current && current[f] !== lock[f]);
const missing = Object.keys(lock).filter(f => !(f in current));
const added = files.filter(f => !(f in lock));

if (update) {
  if (changed.length || missing.length) {
    throw new Error(`Refusing to update the lock: applied migrations were edited or removed (${[...changed, ...missing].join(', ')}). Restore them and add a new migration instead.`);
  }
  await writeFile(lockPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Recorded ${added.length} new migration(s) in supabase/migrations.lock.json.`);
} else {
  const problems = [
    ...changed.map(f => `edited after it was recorded: ${f}`),
    ...missing.map(f => `removed or renamed: ${f}`),
    ...added.map(f => `new and not yet recorded: ${f} (run npm run migrations:lock)`),
  ];
  if (problems.length) {
    throw new Error(`Migration lock check failed. Never edit an applied migration; add a new one.\n- ${problems.join('\n- ')}`);
  }
  console.log(`Migration lock verified: ${files.length} migrations unchanged.`);
}
