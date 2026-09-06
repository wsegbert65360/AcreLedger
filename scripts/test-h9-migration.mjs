// Isolated PostgreSQL regression test; no network or farm data is used.
// Run with the absolute path to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(
  new URL('../supabase/migrations/20260906013728_create_harvest_with_grain.sql', import.meta.url),
  'utf8',
);
const farm = '00000000-0000-0000-0000-000000000001';
const otherFarm = '00000000-0000-0000-0000-000000000002';
const user = '00000000-0000-0000-0000-000000000003';
const harvestId = '00000000-0000-0000-0000-000000000004';
const grainId = '00000000-0000-0000-0000-000000000005';
const fieldId = '00000000-0000-0000-0000-000000000006';
const binId = '00000000-0000-0000-0000-000000000007';

await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
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
    timestamp timestamptz NOT NULL, deleted_at timestamptz
  );
  CREATE TABLE public.grain_movements (
    id uuid PRIMARY KEY, farm_id uuid NOT NULL, bin_id uuid NOT NULL,
    bin_name text NOT NULL, type text NOT NULL, bushels numeric NOT NULL,
    moisture_percent numeric NOT NULL, source_field_name text,
    season_year integer NOT NULL, timestamp timestamptz NOT NULL,
    deleted_at timestamptz, harvest_record_id uuid REFERENCES public.harvest_records(id),
    version bigint NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX one_active_movement_per_harvest
    ON public.grain_movements(harvest_record_id)
    WHERE harvest_record_id IS NOT NULL AND deleted_at IS NULL;
  GRANT SELECT ON public.profiles TO authenticated;
  GRANT SELECT, INSERT ON public.harvest_records, public.grain_movements TO authenticated;
  INSERT INTO public.profiles VALUES ('${user}', '${farm}');
`);
await db.exec(migration);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);

const harvest = {
  id: harvestId, farm_id: farm, field_id: fieldId, field_name: 'North 40',
  destination: 'bin', bin_id: binId, bushels: 1200, moisture_percent: 15,
  landlord_split_percent: 0, season_year: 2026,
  timestamp: '2026-09-05T20:00:00.000Z', deleted_at: null,
};
const grain = {
  id: grainId, farm_id: farm, bin_id: binId, bin_name: 'Bin 1', type: 'in',
  bushels: 1200, moisture_percent: 15, source_field_name: 'North 40',
  season_year: 2026, timestamp: '2026-09-05T20:00:00.000Z', deleted_at: null,
  harvest_record_id: harvestId, version: 1,
};
const call = (farmId, key, harvestPayload, grainPayload) => db.query(
  'SELECT public.create_harvest_with_grain($1, $2, $3::jsonb, $4::jsonb) AS value',
  [farmId, key, JSON.stringify(harvestPayload), JSON.stringify(grainPayload)],
);

const created = await call(farm, harvestId, harvest, grain);
assert.equal(created.rows[0].value.already_applied, false);
const retried = await call(farm, harvestId, harvest, grain);
assert.equal(retried.rows[0].value.already_applied, true);
assert.equal((await db.query('SELECT count(*)::int AS value FROM public.harvest_records')).rows[0].value, 1);
assert.equal((await db.query('SELECT count(*)::int AS value FROM public.grain_movements')).rows[0].value, 1);

await assert.rejects(call(farm, harvestId, { ...harvest, bushels: 999 }, grain), { code: '23505' });
await assert.rejects(call(otherFarm, harvestId, harvest, grain), { code: '42501' });

const badHarvestId = '00000000-0000-0000-0000-000000000008';
const badGrainId = '00000000-0000-0000-0000-000000000009';
await assert.rejects(call(
  farm,
  badHarvestId,
  { ...harvest, id: badHarvestId },
  { ...grain, id: badGrainId, harvest_record_id: badHarvestId, bin_id: null },
), { code: '23502' });
assert.equal(
  (await db.query(`SELECT count(*)::int AS value FROM public.harvest_records WHERE id = '${badHarvestId}'`)).rows[0].value,
  0,
  'grain insertion failure must roll back the harvest insert',
);

await db.close();
console.log('H9 PostgreSQL regression checks passed: atomic pair, idempotent retry, payload collision, rollback, and farm isolation.');
