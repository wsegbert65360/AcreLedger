// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with `node scripts/test-h9-migration.mjs` or pass the absolute path to
// @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = process.argv[2]
  ? await import(pathToFileURL(process.argv[2]).href)
  : await import('@electric-sql/pglite');
const readMigration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const migrations = await Promise.all([
  readMigration('20260906012508_reconcile_offline_sync_zero_row.sql'),
  readMigration('20260906013728_create_harvest_with_grain.sql'),
  readMigration('20261013022119_harvest_grain_retry_by_identity.sql'),
]);

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const farm = id(1);
const otherFarm = id(2);
const user = id(3);
const fieldId = id(6);
const binId = id(7);

const db = new PGlite();
// Mirrors production: RLS hides other farms and tombstones from the invoker,
// and the harvest link is farm-scoped (20260922120000).
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
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, field_id uuid NOT NULL,
    field_name text NOT NULL, destination text NOT NULL, bin_id uuid,
    bushels numeric NOT NULL, moisture_percent numeric NOT NULL,
    landlord_split_percent numeric NOT NULL, season_year integer NOT NULL,
    timestamp timestamptz NOT NULL, deleted_at timestamptz,
    CONSTRAINT harvest_records_farm_id_id_key UNIQUE (farm_id, id)
  );
  CREATE TABLE public.grain_movements (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, bin_id uuid NOT NULL,
    bin_name text NOT NULL, type text NOT NULL, bushels numeric NOT NULL,
    moisture_percent numeric NOT NULL, source_field_name text,
    season_year integer NOT NULL, timestamp timestamptz NOT NULL,
    deleted_at timestamptz, harvest_record_id uuid,
    version bigint NOT NULL DEFAULT 1,
    FOREIGN KEY (farm_id, harvest_record_id) REFERENCES public.harvest_records(farm_id, id)
  );
  CREATE UNIQUE INDEX one_active_movement_per_harvest
    ON public.grain_movements(harvest_record_id)
    WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;
  ALTER TABLE public.harvest_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.grain_movements ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own_live_harvests ON public.harvest_records FOR SELECT TO authenticated
    USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL);
  CREATE POLICY own_harvest_inserts ON public.harvest_records FOR INSERT TO authenticated
    WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
  CREATE POLICY own_live_grain ON public.grain_movements FOR SELECT TO authenticated
    USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL);
  CREATE POLICY own_grain_inserts ON public.grain_movements FOR INSERT TO authenticated
    WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
  GRANT SELECT ON public.profiles TO authenticated;
  GRANT SELECT, INSERT ON public.harvest_records, public.grain_movements TO authenticated;
  INSERT INTO public.profiles VALUES ('${user}', '${farm}');
`);
for (const migration of migrations) await db.exec(migration);

const grants = await db.query(`
  SELECT has_function_privilege('authenticated', 'public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb)', 'EXECUTE') AS authenticated,
         has_function_privilege('anon', 'public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb)', 'EXECUTE') AS anon,
         (SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_harvest_with_grain(uuid, uuid, jsonb, jsonb)'::regprocedure) AS definer
`);
assert.deepEqual(grants.rows[0], { authenticated: true, anon: false, definer: false }, 'grants and invoker security are unchanged');

await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);
// Out-of-band edits (another device, cascade soft delete) bypass the caller's RLS.
const asOwner = async sql => {
  await db.exec('RESET ROLE');
  try { await db.exec(sql); } finally { await db.exec('SET ROLE authenticated'); }
};
const count = async (table, where = 'true') => {
  await db.exec('RESET ROLE');
  try {
    return (await db.query(`SELECT count(*)::int AS value FROM public.${table} WHERE ${where}`)).rows[0].value;
  } finally { await db.exec('SET ROLE authenticated'); }
};

const pair = (harvestId, grainId) => ({
  harvest: {
    id: harvestId, farm_id: farm, field_id: fieldId, field_name: 'North 40',
    destination: 'bin', bin_id: binId, bushels: 1200, moisture_percent: 15,
    landlord_split_percent: 0, season_year: 2026,
    timestamp: '2026-09-05T20:00:00.000Z', deleted_at: null,
  },
  grain: {
    id: grainId, farm_id: farm, bin_id: binId, bin_name: 'Bin 1', type: 'in',
    bushels: 1200, moisture_percent: 15, source_field_name: 'North 40',
    season_year: 2026, timestamp: '2026-09-05T20:00:00.000Z', deleted_at: null,
    harvest_record_id: harvestId, version: 1,
  },
});
const call = (farmId, key, harvestPayload, grainPayload) => db.query(
  'SELECT public.create_harvest_with_grain($1, $2, $3::jsonb, $4::jsonb) AS value',
  [farmId, key, JSON.stringify(harvestPayload), JSON.stringify(grainPayload)],
);
const applied = async (...args) => (await call(...args)).rows[0].value.already_applied;

// Create and exact retry.
const a = pair(id(4), id(5));
assert.equal(await applied(farm, a.harvest.id, a.harvest, a.grain), false);
assert.equal(await applied(farm, a.harvest.id, a.harvest, a.grain), true);
assert.equal(await count('harvest_records'), 1);
assert.equal(await count('grain_movements'), 1);
await assert.rejects(call(otherFarm, a.harvest.id, a.harvest, a.grain), { code: '42501' });

// Retry after the pair was edited elsewhere: different values and grain version.
await asOwner(`
  UPDATE public.harvest_records SET bushels = 900 WHERE id = '${a.harvest.id}';
  UPDATE public.grain_movements SET bushels = 900, version = 2 WHERE id = '${a.grain.id}';
`);
assert.equal(await applied(farm, a.harvest.id, a.harvest, a.grain), true, 'edited pair is already applied');
assert.equal(await applied(farm, a.harvest.id, { ...a.harvest, bushels: 999 }, a.grain), true, 'stale payload values do not matter');
assert.equal(await count('grain_movements', `id = '${a.grain.id}' AND version = 2 AND bushels = 900`), 1, 'retry must not overwrite edits');

// Retry after the pair was soft-deleted: tombstones are invisible to RLS but still match.
await asOwner(`
  UPDATE public.harvest_records SET deleted_at = '2026-10-10T00:00:00Z' WHERE id = '${a.harvest.id}';
  UPDATE public.grain_movements SET deleted_at = '2026-10-10T00:00:00Z', version = 3 WHERE id = '${a.grain.id}';
`);
assert.equal(await applied(farm, a.harvest.id, a.harvest, a.grain), true, 'deleted pair is already applied');
assert.equal(await count('harvest_records'), 1, 'no duplicate harvest');
assert.equal(await count('grain_movements'), 1, 'no duplicate grain movement');
assert.equal(await count('harvest_records', 'deleted_at IS NULL'), 0, 'retry must not resurrect the harvest');
assert.equal(await count('grain_movements', 'deleted_at IS NULL'), 0, 'retry must not resurrect the grain movement');

// Identity mismatches fail closed.
const b = pair(id(10), id(11));
await assert.rejects(
  call(farm, b.harvest.id, b.harvest, { ...b.grain, harvest_record_id: a.harvest.id }),
  { code: '22023' },
  'queued grain link must match the harvest',
);
await assert.rejects(call(farm, b.harvest.id, b.harvest, { ...b.grain, id: a.grain.id }), { code: '23503' },
  'existing grain ID without this harvest');
await asOwner(`INSERT INTO public.harvest_records SELECT * FROM jsonb_populate_record(NULL::public.harvest_records, '${JSON.stringify(b.harvest)}'::jsonb)`);
await assert.rejects(call(farm, b.harvest.id, b.harvest, { ...b.grain, id: a.grain.id }), { code: '23505' },
  'grain ID linked to a different harvest');
assert.equal(await count('grain_movements', `id = '${a.grain.id}' AND harvest_record_id = '${a.harvest.id}'`), 1);

// Legacy partial pair: an active harvest without its movement is completed once.
assert.equal(await applied(farm, b.harvest.id, b.harvest, b.grain), false);
assert.equal(await applied(farm, b.harvest.id, b.harvest, b.grain), true);
assert.equal(await count('grain_movements', `harvest_record_id = '${b.harvest.id}'`), 1);
// ...but a deleted harvest never gains a live movement.
const c = pair(id(12), id(13));
await asOwner(`INSERT INTO public.harvest_records SELECT * FROM jsonb_populate_record(NULL::public.harvest_records, '${JSON.stringify({ ...c.harvest, deleted_at: '2026-10-10T00:00:00Z' })}'::jsonb)`);
await assert.rejects(call(farm, c.harvest.id, c.harvest, c.grain), { code: '23505' });
assert.equal(await count('grain_movements', `id = '${c.grain.id}'`), 0);

// IDs owned by another farm are invisible and collide on the primary key.
const d = pair(id(14), id(15));
await asOwner(`
  INSERT INTO public.harvest_records SELECT * FROM jsonb_populate_record(NULL::public.harvest_records, '${JSON.stringify({ ...d.harvest, farm_id: otherFarm })}'::jsonb);
`);
await assert.rejects(call(farm, d.harvest.id, d.harvest, d.grain), { code: '23505' }, 'foreign harvest ID');
const e = pair(id(16), id(17));
await asOwner(`
  INSERT INTO public.harvest_records SELECT * FROM jsonb_populate_record(NULL::public.harvest_records, '${JSON.stringify({ ...e.harvest, id: id(18), farm_id: otherFarm })}'::jsonb);
  INSERT INTO public.grain_movements SELECT * FROM jsonb_populate_record(NULL::public.grain_movements, '${JSON.stringify({ ...e.grain, farm_id: otherFarm, harvest_record_id: id(18) })}'::jsonb);
`);
await assert.rejects(call(farm, e.harvest.id, e.harvest, e.grain), { code: '23505' }, 'foreign grain ID');
assert.equal(await count('harvest_records', `id = '${e.harvest.id}'`), 0, 'foreign grain collision rolls back the harvest');
assert.equal(await count('grain_movements', `farm_id = '${farm}' AND id IN ('${d.grain.id}', '${e.grain.id}')`), 0);

// Grain insertion failure rolls back the harvest insert.
const f = pair(id(19), id(20));
await assert.rejects(call(farm, f.harvest.id, f.harvest, { ...f.grain, bin_id: null }), { code: '23502' });
assert.equal(await count('harvest_records', `id = '${f.harvest.id}'`), 0, 'grain insertion failure must roll back the harvest insert');

await db.close();
console.log('H9 PostgreSQL regression checks passed: atomic pair, identity-only retry after edit/delete, identity mismatches, legacy partial pair, rollback, farm isolation, and unchanged grants.');
