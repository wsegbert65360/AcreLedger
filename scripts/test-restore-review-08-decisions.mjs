// Isolated PostgreSQL checks for the review-08 restore decisions.
// No network and no live database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20261015175710_restore_owner_admin_and_timeout.sql', import.meta.url),
  'utf8',
);

const ids = {
  farm: '00000000-0000-4000-8000-0000000000a1',
  user: '00000000-0000-4000-8000-0000000000a2',
  kept: '00000000-0000-4000-8000-0000000000a3',
  added: '00000000-0000-4000-8000-0000000000a4',
  tractKept: '00000000-0000-4000-8000-0000000000b1',
  tractAdded: '00000000-0000-4000-8000-0000000000b2',
};

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE SCHEMA extensions;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE public.farms (id uuid PRIMARY KEY, name text);
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    farm_id uuid,
    active_season integer
  );
  INSERT INTO public.farms (id, name) VALUES ('${ids.farm}', 'Home Place');
  INSERT INTO public.profiles (id, farm_id, active_season) VALUES ('${ids.user}', '${ids.farm}', 2026);
`);

const plainTables = [
  'fields', 'bins', 'plant_records', 'spray_records', 'harvest_records',
  'hay_harvest_records', 'custom_spray_records', 'fertilizer_applications',
  'tillage_records', 'grain_movements', 'saved_seeds', 'fertilizer_recipes',
  'spray_recipes', 'work_requests', 'equipment', 'maintenance_schedules',
  'maintenance_logs',
];
for (const table of plainTables) {
  await db.exec(`CREATE TABLE public.${table} (
    id uuid PRIMARY KEY,
    farm_id uuid,
    deleted_at timestamptz
  )`);
}
await db.exec(`
  CREATE TABLE public.fsa_tract_imports (
    id uuid PRIMARY KEY,
    farm_id uuid,
    tract_key text,
    deleted_at timestamptz
  );
  CREATE TABLE public.field_clu_assignments (
    id uuid PRIMARY KEY,
    farm_id uuid,
    tract_key text,
    clu_number text,
    deleted_at timestamptz
  );
  CREATE FUNCTION public._restore_table_for_farm(regclass, jsonb, uuid)
  RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
  CREATE FUNCTION public._restore_table_for_farm_with_conflict(regclass, jsonb, uuid, text[])
  RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
`);

await db.exec(migration);

const config = (await db.query(`
  SELECT proconfig
  FROM pg_proc
  WHERE proname = 'restore_farm_backup'
`)).rows[0].proconfig;
assert.ok(
  String(config).includes('statement_timeout=120s'),
  `restore_farm_backup must set statement_timeout=120s, got ${config}`,
);

const anonExecute = (await db.query(`
  SELECT has_function_privilege('anon', 'public.restore_farm_backup(jsonb, integer)', 'EXECUTE') AS ok
`)).rows[0].ok;
assert.equal(anonExecute, false, 'anon must not execute restore_farm_backup');

const roleUpdate = (await db.query(`
  SELECT has_column_privilege('authenticated', 'public.profiles', 'farm_role', 'UPDATE') AS ok
`)).rows[0].ok;
assert.equal(roleUpdate, false, 'authenticated must not update profiles.farm_role');

const defaultRole = (await db.query(`
  SELECT farm_role FROM public.profiles WHERE id = '${ids.user}'
`)).rows[0].farm_role;
assert.equal(defaultRole, 'owner', 'existing profiles default to owner');

await db.exec(`
  INSERT INTO public.fields (id, farm_id) VALUES
    ('${ids.kept}', '${ids.farm}'),
    ('${ids.added}', '${ids.farm}');
  INSERT INTO public.fsa_tract_imports (id, farm_id, tract_key) VALUES
    ('${ids.tractKept}', '${ids.farm}', 'kept'),
    ('${ids.tractAdded}', '${ids.farm}', 'added-later');
  SELECT set_config('request.jwt.claim.sub', '${ids.user}', false);
`);

async function restore(payload) {
  return db.query(`SELECT public.restore_farm_backup($1::jsonb, NULL) AS result`, [JSON.stringify(payload)]);
}

async function asOwner(payload) {
  await db.exec('SET ROLE authenticated');
  try {
    return await restore(payload);
  } finally {
    await db.exec('RESET ROLE');
  }
}

const ownerResult = await asOwner({});
assert.equal(ownerResult.rows[0].result.fields, 0);

await db.exec(`UPDATE public.profiles SET farm_role = 'admin' WHERE id = '${ids.user}'`);
await asOwner({});

await db.exec(`UPDATE public.profiles SET farm_role = 'worker' WHERE id = '${ids.user}'`);
await assert.rejects(asOwner({}), { code: '42501' });
const stillThere = (await db.query(`
  SELECT count(*)::int AS n FROM public.fields WHERE deleted_at IS NULL
`)).rows[0].n;
assert.equal(stillThere, 2, 'a refused worker restore must not change rows');

await db.exec(`UPDATE public.profiles SET farm_role = 'owner' WHERE id = '${ids.user}'`);
await asOwner({
  fields: [{ id: ids.kept }],
});
const ordinary = (await db.query(`
  SELECT id::text AS id FROM public.fields WHERE deleted_at IS NULL ORDER BY id
`)).rows.map((row) => row.id);
assert.deepEqual(ordinary, [ids.kept, ids.added], 'an ordinary restore leaves rows that are not in the file');

await asOwner({
  _pre_season_reset: true,
  _rollback_tables: ['fields', 'fsa_tract_imports'],
  fields: [{ id: ids.kept }],
  fsa_tract_imports: [{ tract_key: 'kept' }],
});
const rolledFields = (await db.query(`
  SELECT id::text AS id, (deleted_at IS NOT NULL) AS hidden
  FROM public.fields
  ORDER BY id
`)).rows;
assert.deepEqual(rolledFields, [
  { id: ids.kept, hidden: false },
  { id: ids.added, hidden: true },
]);
const rolledTracts = (await db.query(`
  SELECT tract_key, (deleted_at IS NOT NULL) AS hidden
  FROM public.fsa_tract_imports
  ORDER BY tract_key
`)).rows;
assert.deepEqual(rolledTracts, [
  { tract_key: 'added-later', hidden: true },
  { tract_key: 'kept', hidden: false },
]);

await assert.rejects(
  asOwner({ _pre_season_reset: true, _rollback_tables: ['profiles'] }),
  { code: '22023' },
);

console.log('Review-08 restore decisions passed: owner/admin only, 120s timeout, pre-season rollback, worker refusal.');
