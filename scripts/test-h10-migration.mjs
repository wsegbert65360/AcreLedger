// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with the absolute path to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const versionMigration = await readFile(
  new URL('../supabase/migrations/20260906013307_version_grain_movements.sql', import.meta.url),
  'utf8',
);
const cascadeMigration = await readFile(
  new URL('../supabase/migrations/20260906014303_cascade_soft_delete_harvest_grain.sql', import.meta.url),
  'utf8',
);
const farm = '00000000-0000-0000-0000-000000000001';
const otherFarm = '00000000-0000-0000-0000-000000000002';
const user = '00000000-0000-0000-0000-000000000003';
const firstHarvest = '00000000-0000-0000-0000-000000000004';
const secondHarvest = '00000000-0000-0000-0000-000000000005';
const firstGrain = '00000000-0000-0000-0000-000000000006';
const secondGrain = '00000000-0000-0000-0000-000000000007';

await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.harvest_records (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, deleted_at timestamptz
  );
  CREATE TABLE public.grain_movements (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL,
    harvest_record_id uuid REFERENCES public.harvest_records(id),
    bushels numeric NOT NULL, deleted_at timestamptz
  );
  GRANT SELECT ON public.profiles TO authenticated;
  GRANT SELECT, UPDATE ON public.harvest_records, public.grain_movements TO authenticated;
  INSERT INTO public.profiles VALUES ('${user}', '${farm}');
  INSERT INTO public.harvest_records VALUES
    ('${firstHarvest}', '${farm}', null),
    ('${secondHarvest}', '${farm}', null);
  INSERT INTO public.grain_movements VALUES
    ('${firstGrain}', '${farm}', '${firstHarvest}', 100, null),
    ('${secondGrain}', '${farm}', '${secondHarvest}', 200, null);
`);
await db.exec(versionMigration);
await db.exec(cascadeMigration);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);

const deletedAt = '2026-09-06T02:00:00.000Z';
const deleted = await db.query(
  'SELECT public.soft_delete_harvests_with_grain($1, $2::uuid[], $3) AS value',
  [farm, [firstHarvest], deletedAt],
);
assert.deepEqual(deleted.rows[0].value, { harvest_count: 1, grain_movement_count: 1 });
assert.equal(
  (await db.query(`SELECT deleted_at IS NOT NULL AS deleted FROM public.grain_movements WHERE id = '${firstGrain}'`)).rows[0].deleted,
  true,
);
assert.equal(
  (await db.query(`SELECT version FROM public.grain_movements WHERE id = '${firstGrain}'`)).rows[0].version,
  2,
  'cascade must use the normal version-bumping update path',
);

await assert.rejects(
  db.query(
    'SELECT public.soft_delete_harvests_with_grain($1, $2::uuid[], $3)',
    [farm, [secondHarvest, '00000000-0000-0000-0000-000000000099'], deletedAt],
  ),
  { code: '40001' },
);
assert.equal(
  (await db.query(`SELECT deleted_at IS NULL AS active FROM public.harvest_records WHERE id = '${secondHarvest}'`)).rows[0].active,
  true,
  'a stale batch must not partially delete a harvest',
);
assert.equal(
  (await db.query(`SELECT deleted_at IS NULL AS active FROM public.grain_movements WHERE id = '${secondGrain}'`)).rows[0].active,
  true,
);

await db.exec(`UPDATE public.harvest_records SET deleted_at = '${deletedAt}' WHERE id = '${secondHarvest}'`);
assert.equal(
  (await db.query(`SELECT deleted_at IS NOT NULL AS deleted FROM public.grain_movements WHERE id = '${secondGrain}'`)).rows[0].deleted,
  true,
  'generic offline replay must also cascade through the trigger',
);
await assert.rejects(
  db.query(
    'SELECT public.soft_delete_harvests_with_grain($1, $2::uuid[], $3)',
    [otherFarm, [firstHarvest], deletedAt],
  ),
  { code: '42501' },
);

await db.close();
console.log('H10 PostgreSQL regression checks passed: transactional cascade, rollback, offline replay, version bump, and farm isolation.');
