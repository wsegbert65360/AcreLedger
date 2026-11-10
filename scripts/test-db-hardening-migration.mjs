import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationName, rollbackName, snapshot, printSnapshot, assertHardened } from './db-hardening-fixture.mjs';

const sql = await readFile(new URL(`../supabase/migrations/${migrationName}.sql`, import.meta.url), 'utf8');
const rollback = await readFile(new URL(`../supabase/rollbacks/${rollbackName}.sql`, import.meta.url), 'utf8');
const observedTables = [
  'bins', 'farm_rainfall_daily', 'farm_subscriptions', 'farms',
  'fertilizer_applications', 'fertilizer_recipes', 'field_clu_assignments',
  'field_rainfall_coverage', 'field_rainfall_hourly', 'fields', 'fsa_tract_imports',
  'grain_movements', 'harvest_records', 'hay_harvest_records', 'plant_records',
  'profiles', 'rainfall_settings', 'saved_seeds', 'spray_recipes', 'spray_records',
  'tillage_records', 'todos',
].sort();
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE TABLE public.fields (id int);
    CREATE TABLE public.extra_table (id int);
    CREATE TABLE public.partitioned (id int) PARTITION BY RANGE(id);
    CREATE TABLE public.partition_child PARTITION OF public.partitioned FOR VALUES FROM (0) TO (10);
    CREATE VIEW public.sample_view AS SELECT * FROM public.fields;
    CREATE MATERIALIZED VIEW public.sample_matview AS SELECT * FROM public.fields;
    GRANT MAINTAIN ON ALL TABLES IN SCHEMA public TO PUBLIC;
    CREATE SCHEMA acreage_backfill_private;
    CREATE FUNCTION acreage_backfill_private.historical_backfills_retired() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
    CREATE FUNCTION public.pinned_definer() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT true';
    CREATE FUNCTION public.unpinned_invoker() RETURNS boolean LANGUAGE sql AS 'SELECT true';
  `);
  for (const table of observedTables.filter(table => table !== 'fields')) {
    await db.exec(`CREATE TABLE public.${table} (id int)`);
  }
  const before = await snapshot(db);
  printSnapshot('BEFORE', before);
  await db.exec(sql);
  const after = await snapshot(db);
  printSnapshot('AFTER', after);
  assertHardened(before, after);
  assert.deepEqual(after.functions.find(f => f.signature.includes('historical_backfills_retired')).proconfig, ['search_path=""']);
  assert.deepEqual((await db.query('SELECT acreage_backfill_private.historical_backfills_retired() AS retired, public.pinned_definer() AS pinned')).rows, [{retired: true, pinned: true}]);
  await db.exec(sql);
  assert.deepEqual(await snapshot(db), after);
  await db.exec('CREATE TABLE public.future_table (id int)');
  const future = (await snapshot(db)).grants.filter(g => g.relname === 'future_table');
  assert.equal(future.some(g => ['anon','authenticated'].includes(g.role) && g.privilege_type === 'MAINTAIN'), false);
  assert(future.some(g => g.role === 'service_role' && g.privilege_type === 'MAINTAIN'));
  await db.exec(rollback);
  const restored = await snapshot(db);
  assert.deepEqual(restored.grants.filter(g => g.role === 'authenticated' && g.privilege_type === 'MAINTAIN').map(g => g.relname), observedTables);
  assert.equal(restored.functions.find(f => f.signature.includes('historical_backfills_retired')).proconfig, null);
  await db.exec(rollback);
  assert.deepEqual(await snapshot(db), restored);
  console.log('DB hardening migration and rollback passed (disposable PGlite only).');
} finally { await db.close(); }

// Missing optional schemas/functions and API roles must also replay safely.
const empty = new PGlite();
try {
  await empty.exec(sql);
  await empty.exec(sql);
  await empty.exec(rollback);
  await empty.exec('CREATE ROLE limited_executor; CREATE ROLE anon; CREATE ROLE authenticated; SET ROLE limited_executor');
  // No membership in postgres: default-privilege permission denial is caught.
  await empty.exec(sql);
  await empty.exec('RESET ROLE');
}
finally { await empty.close(); }
