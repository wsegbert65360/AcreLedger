import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(import.meta.dirname, '..');
const migrationDir = resolve(root, 'supabase/migrations');
const config = await readFile(resolve(root, 'supabase/config.toml'), 'utf8');
const files = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();

assert(files.length > 0, 'No Supabase migrations were found.');
for (const file of files) {
  assert.match(file, /^\d{14}_[a-z0-9_]+\.sql$/, `Invalid migration filename: ${file}`);
}
assert.equal(new Set(files.map((file) => file.slice(0, 14))).size, files.length, 'Migration timestamps must be unique.');
assert.match(config, /\[db\.seed\][\s\S]*?enabled\s*=\s*false/, 'Seed execution must stay disabled until canonical seed data exists.');
assert.match(config, /\[db\.seed\][\s\S]*?sql_paths\s*=\s*\[\]/, 'Disabled seed configuration must not reference missing files.');

const migrationSql = new Map();
for (const file of files) {
  migrationSql.set(file, await readFile(resolve(migrationDir, file), 'utf8'));
}

const first = migrationSql.get(files[0]);
const createsCoreSchema = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?harvest_records\b/i.test(first)
  && /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?grain_movements\b/i.test(first);

if (!createsCoreSchema) {
  throw new Error(
    `Database bootstrap blocker: ${files[0]} mutates an assumed pre-existing schema. `
    + 'Obtain an authoritative schema-only dump from the linked production project, review it for secrets/ownership, '
    + 'and establish a reconciled baseline before claiming that `supabase db reset` is reproducible.',
  );
}

function stripSql(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const created = new Set();
const altered = new Map();
const createRe = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const alterRe = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
for (const file of files) {
  const sql = stripSql(migrationSql.get(file));
  for (const match of sql.matchAll(createRe)) created.add(match[1].toLowerCase());
  for (const match of sql.matchAll(alterRe)) {
    const table = match[1].toLowerCase();
    if (table === 'public' || altered.has(table)) continue;
    altered.set(table, file);
  }
}
const neverCreated = [...altered.keys()].filter((table) => !created.has(table)).sort();

const db = new PGlite();
let applied = 0;
let replayFailure = null;
try {
  for (const file of files) {
    try {
      await db.exec(migrationSql.get(file));
      applied += 1;
    } catch (err) {
      const message = (err && err.message ? err.message : String(err)).split('\n')[0];
      replayFailure = { file, message };
      break;
    }
  }
} finally {
  await db.close();
}

if (replayFailure || neverCreated.length > 0) {
  const replayText = replayFailure
    ? `Disposable PostgreSQL replay applied ${applied} migration(s), then ${replayFailure.file} failed: ${replayFailure.message}.`
    : 'Disposable PostgreSQL replay completed, but later migrations still alter relations that this history never creates.';
  const missingText = neverCreated.length > 0
    ? ` Relations altered without any CREATE TABLE in supabase/migrations: ${neverCreated.join(', ')}.`
    : '';
  throw new Error(
    'Database bootstrap blocker: `supabase db reset` is not reproducible. '
    + `${files[0]} reconstructs public.harvest_records and public.grain_movements only; it is not an authoritative schema-only dump. `
    + `${replayText}${missingText} `
    + 'Obtain a schema-only dump from the linked production project, review it for secrets and ownership, '
    + 'and replace the reconstruction before claiming that reset is reproducible.',
  );
}

console.log(`Verified ${files.length} ordered Supabase migrations, deterministic seed configuration, and a disposable PostgreSQL replay.`);
