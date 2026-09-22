import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

const first = await readFile(resolve(migrationDir, files[0]), 'utf8');
const createsCoreSchema = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?harvest_records\b/i.test(first)
  && /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?grain_movements\b/i.test(first);

if (!createsCoreSchema) {
  throw new Error(
    `Database bootstrap blocker: ${files[0]} mutates an assumed pre-existing schema. `
    + 'Obtain an authoritative schema-only dump from the linked production project, review it for secrets/ownership, '
    + 'and establish a reconciled baseline before claiming that `supabase db reset` is reproducible.',
  );
}

console.log(`Verified ${files.length} ordered Supabase migrations and deterministic seed configuration.`);
