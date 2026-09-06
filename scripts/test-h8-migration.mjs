// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with the absolute path to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(
  new URL('../supabase/migrations/20260906013307_version_grain_movements.sql', import.meta.url),
  'utf8',
);
const farm = '00000000-0000-0000-0000-000000000001';
const otherFarm = '00000000-0000-0000-0000-000000000002';
const user = '00000000-0000-0000-0000-000000000003';
const first = '00000000-0000-0000-0000-000000000004';
const second = '00000000-0000-0000-0000-000000000005';

await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.grain_movements (
    id uuid PRIMARY KEY,
    farm_id uuid NOT NULL,
    bushels numeric NOT NULL,
    deleted_at timestamptz
  );
  GRANT SELECT ON public.profiles TO authenticated;
  GRANT SELECT, UPDATE ON public.grain_movements TO authenticated;
  INSERT INTO public.profiles VALUES ('${user}', '${farm}');
  INSERT INTO public.grain_movements VALUES
    ('${first}', '${farm}', 100, null),
    ('${second}', '${farm}', 200, null);
`);
await db.exec(migration);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);

await db.exec(`UPDATE public.grain_movements SET bushels = 90 WHERE id = '${first}' AND version = 1`);
assert.equal(
  (await db.query(`SELECT version FROM public.grain_movements WHERE id = '${first}'`)).rows[0].version,
  2,
  'ordinary updates increment the database-managed version',
);

const deleteAt = '2026-09-06T01:00:00.000Z';
const staleBatch = [
  { id: first, version: 1, deleted_at: deleteAt },
  { id: second, version: 1, deleted_at: deleteAt },
];
await assert.rejects(
  db.query('SELECT public.soft_delete_grain_movements_versioned($1, $2::jsonb)', [farm, JSON.stringify(staleBatch)]),
  { code: '40001' },
);
assert.equal(
  (await db.query('SELECT count(*)::int AS value FROM public.grain_movements WHERE deleted_at IS NULL')).rows[0].value,
  2,
  'a stale batch rolls back without a partial delete',
);

const currentBatch = [
  { id: first, version: 2, deleted_at: deleteAt },
  { id: second, version: 1, deleted_at: deleteAt },
];
const deleted = await db.query(
  'SELECT public.soft_delete_grain_movements_versioned($1, $2::jsonb) AS value',
  [farm, JSON.stringify(currentBatch)],
);
assert.equal(deleted.rows[0].value, 2);
assert.deepEqual(
  (await db.query('SELECT version FROM public.grain_movements ORDER BY id')).rows.map(row => row.version),
  [3, 2],
);
await assert.rejects(
  db.query('SELECT public.soft_delete_grain_movements_versioned($1, $2::jsonb)', [otherFarm, JSON.stringify(currentBatch)]),
  { code: '42501' },
);

await db.close();
console.log('H8 PostgreSQL regression checks passed: version bump, stale-write rejection, atomic delete, and farm isolation.');
