import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261121170000_restore_county_assignments.sql.
// A backup's county assignments (manual splits included) are restored, a
// live row for the same subject and county under another id is retired
// instead of aborting the restore, and another farm's ids are refused.
const db = new PGlite();
const mig = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const id = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const farm = id(1);
const other = id(2);
const user = id(3);
const field = id(4);
const manualHenry = id(10);
const manualBenton = id(11);
const liveDuplicate = id(12);
const otherFarmRow = id(13);

const county = (rowId, fips, name, acres, farmId = farm) => ({
  id: rowId, farm_id: farmId, subject_type: 'field', subject_key: field, field_id: field,
  tract_key: null, clu_number: null, county_fips: fips, county_name: name, state_abbr: 'MO',
  mapped_acres: null, proportion: null, manual_acres: acres, method: 'manual', review_status: 'reviewed',
  review_reason: null, geometry_hash: null, dataset_source: null, dataset_version: null,
  calculated_at: '2026-11-19T00:00:00Z', deleted_at: null,
});
const restore = (payload) => db.query('SELECT public.restore_farm_backup($1::jsonb, NULL) AS value', [JSON.stringify(payload)]).then(r => r.rows[0].value);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    CREATE TABLE public.fields (id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, deleted_at timestamptz, UNIQUE (farm_id, id));
    INSERT INTO public.farms VALUES ('${farm}'), ('${other}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    INSERT INTO public.fields VALUES ('${field}', '${farm}', NULL);
    CREATE TABLE public.county_assignments (
      id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, subject_type text NOT NULL, subject_key text NOT NULL,
      field_id uuid, tract_key text, clu_number text, county_fips text, county_name text, state_abbr text,
      mapped_acres numeric(14, 4), proportion numeric(7, 6), manual_acres numeric(12, 2), method text NOT NULL,
      review_status text NOT NULL DEFAULT 'ok', review_reason text, geometry_hash text, dataset_source text, dataset_version text,
      calculated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
      FOREIGN KEY (farm_id, field_id) REFERENCES public.fields (farm_id, id));
    CREATE UNIQUE INDEX county_assignments_live_unique
      ON public.county_assignments (farm_id, subject_type, subject_key, (coalesce(county_fips, 'unresolved')))
      WHERE deleted_at IS NULL;
    CREATE TABLE public.cattle_groups (id uuid PRIMARY KEY, farm_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TABLE public.cattle_moves (id uuid PRIMARY KEY, farm_id uuid NOT NULL, deleted_at timestamptz);
    CREATE TABLE public.cattle_events (id uuid PRIMARY KEY, farm_id uuid NOT NULL, deleted_at timestamptz);
    CREATE FUNCTION public._cattle_restore_group_name(uuid, text, jsonb) RETURNS text LANGUAGE sql AS $$ SELECT $2 $$;
    CREATE FUNCTION public.assert_premium(uuid, text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION public._restore_farm_backup_impl(jsonb, integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  `);
  await db.exec(await mig('20260716015958_preserve_restore_payload_columns.sql').then(sql =>
    // Only the generic helpers; the old wrapper body is replaced below.
    sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public._restore_table_for_farm('), sql.indexOf('CREATE OR REPLACE FUNCTION public._restore_table_for_farm_with_conflict('))));
  await db.exec(await mig('20261121170000_restore_county_assignments.sql'));

  // A live auto row for Henry under another id, and another farm's row.
  await db.query(`INSERT INTO public.county_assignments SELECT * FROM jsonb_populate_record(NULL::public.county_assignments, $1)`,
    [JSON.stringify({ ...county(liveDuplicate, '29083', 'Henry', 50), method: 'manual', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })]);
  await db.query(`INSERT INTO public.fields VALUES ('${id(5)}', '${other}', NULL)`);
  await db.query(`INSERT INTO public.county_assignments SELECT * FROM jsonb_populate_record(NULL::public.county_assignments, $1)`,
    [JSON.stringify({ ...county(otherFarmRow, '29015', 'Benton', 5, other), subject_key: id(5), field_id: id(5), created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })]);

  await db.exec(`SELECT set_config('request.uid', '${user}', false)`);
  const result = await restore({ county_assignments: [county(manualHenry, '29083', 'Henry', 30), county(manualBenton, '29015', 'Benton', 70)] });
  assert.equal(result.county_assignments, 2, 'both manual splits restored');
  assert.equal(result.county_assignment_conflicts, 1, 'the live duplicate was retired, not a restore abort');

  const live = await db.query(`SELECT id, county_name, manual_acres::float AS acres FROM public.county_assignments WHERE farm_id = '${farm}' AND deleted_at IS NULL ORDER BY county_name`);
  assert.deepEqual(live.rows, [
    { id: manualBenton, county_name: 'Benton', acres: 70 },
    { id: manualHenry, county_name: 'Henry', acres: 30 },
  ]);

  // Restoring the same backup again is a no-op.
  const again = await restore({ county_assignments: [county(manualHenry, '29083', 'Henry', 30), county(manualBenton, '29015', 'Benton', 70)] });
  assert.equal(again.county_assignment_conflicts, 0, 'repeat restore retires nothing');

  await assert.rejects(restore({ county_assignments: [county(otherFarmRow, '29015', 'Benton', 5)] }), /owned by another farm/);
  assert.equal((await restore({})).county_assignments, 0, 'a backup without counties restores none');

  console.log('restore county assignments migration: all checks passed');
} finally {
  await db.close();
}
