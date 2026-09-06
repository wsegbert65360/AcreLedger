// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with the absolute path to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(
  new URL('../supabase/migrations/20260906012508_reconcile_offline_sync_zero_row.sql', import.meta.url),
  'utf8',
);
const farm = '00000000-0000-0000-0000-000000000001';
const otherFarm = '00000000-0000-0000-0000-000000000002';
const user = '00000000-0000-0000-0000-000000000003';
const row = '00000000-0000-0000-0000-000000000004';

await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.fields (id uuid PRIMARY KEY, farm_id uuid, name text, deleted_at timestamptz);
  INSERT INTO public.profiles VALUES ('${user}', '${farm}');
  INSERT INTO public.fields VALUES ('${row}', '${farm}', 'Own tombstone', now());
`);
await db.exec(migration);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);

const own = await db.query(
  `SELECT public.get_offline_sync_row_state('fields', '${row}', '${farm}') AS value`,
);
assert.equal(own.rows[0].value.id, row);
assert.ok(own.rows[0].value.deleted_at, 'tombstone must be visible for reconciliation');
await assert.rejects(
  db.query(`SELECT public.get_offline_sync_row_state('fields', '${row}', '${otherFarm}')`),
  { code: '42501' },
);
await assert.rejects(
  db.query(`SELECT public.get_offline_sync_row_state('profiles', '${row}', '${farm}')`),
  { code: '22023' },
);
await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon`);
await assert.rejects(
  db.query(`SELECT public.get_offline_sync_row_state('fields', '${row}', '${farm}')`),
  { code: '42501' },
);

await db.close();
console.log('H6 PostgreSQL regression checks passed: own-farm tombstone, farm isolation, table allowlist, and anonymous denial.');
