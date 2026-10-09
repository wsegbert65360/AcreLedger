import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';

const schemaMigration = await readFile(
  new URL('../supabase/migrations/20261006214500_equipment_maintenance.sql', import.meta.url),
  'utf8',
);
const rpcMigration = await readFile(
  new URL('../supabase/migrations/20261006233000_equipment_meter_rpcs.sql', import.meta.url),
  'utf8',
);
const restoreMigration = await readFile(
  new URL('../supabase/migrations/20261007090000_restore_equipment_tables.sql', import.meta.url),
  'utf8',
);
const restoreConflictMigration = await readFile(
  new URL('../supabase/migrations/20261009024113_restore_equipment_task_name_conflicts.sql', import.meta.url),
  'utf8',
);
const restoreHelperMigration = await readFile(
  new URL('../supabase/migrations/20260716015958_preserve_restore_payload_columns.sql', import.meta.url),
  'utf8',
);

const ids = {
  farm: '00000000-0000-4000-8000-000000000001',
  otherFarm: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003',
  equipment: '00000000-0000-4000-8000-000000000011',
  distanceEquipment: '00000000-0000-4000-8000-000000000012',
  schedule: '00000000-0000-4000-8000-000000000021',
  distanceSchedule: '00000000-0000-4000-8000-000000000022',
  log: '00000000-0000-4000-8000-000000000031',
};

const db = new PGlite();
await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE public.farms (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid, active_season integer);
  INSERT INTO public.farms (id) VALUES ('${ids.farm}'), ('${ids.otherFarm}');
  INSERT INTO public.profiles (id, farm_id) VALUES ('${ids.user}', '${ids.farm}');
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT SELECT ON public.profiles TO authenticated;
`);
await db.exec(schemaMigration);
await db.exec(rpcMigration);
await db.exec(`
  CREATE TABLE public.fields (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.bins (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.plant_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.spray_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.harvest_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.hay_harvest_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.custom_spray_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.fertilizer_applications (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.tillage_records (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.grain_movements (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.saved_seeds (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.fertilizer_recipes (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.spray_recipes (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.work_requests (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.fsa_tract_imports (id uuid PRIMARY KEY, farm_id uuid);
  CREATE TABLE public.field_clu_assignments (id uuid PRIMARY KEY, farm_id uuid);

  CREATE FUNCTION public._restore_table_for_farm(
    p_table regclass,
    p_rows jsonb,
    p_farm_id uuid
  ) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
    v_count integer;
  BEGIN
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
      RETURN 0;
    END IF;
    IF p_table <> 'public.equipment'::regclass THEN
      RETURN 0;
    END IF;
    INSERT INTO public.equipment (id, farm_id, kind, meter_unit, current_reading, status)
    SELECT populated.id, p_farm_id, populated.kind, populated.meter_unit,
      populated.current_reading, populated.status
    FROM jsonb_array_elements(p_rows) AS row_data
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.equipment, row_data) AS populated
    ON CONFLICT (id) DO UPDATE SET
      meter_unit = EXCLUDED.meter_unit,
      current_reading = EXCLUDED.current_reading,
      status = EXCLUDED.status;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END;
  $$;

  CREATE FUNCTION public._restore_table_for_farm_with_conflict(
    p_table regclass,
    p_rows jsonb,
    p_farm_id uuid,
    p_conflict_columns text[]
  ) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;
`);
await db.exec(restoreMigration);
await db.exec(restoreConflictMigration);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ids.user}', false); SET ROLE authenticated;`);

await db.exec(`
  INSERT INTO public.equipment (id, farm_id, kind, meter_unit, current_reading, status)
  VALUES
    ('${ids.equipment}', '${ids.farm}', 'tractor', 'hours', 100, 'active'),
    ('${ids.distanceEquipment}', '${ids.farm}', 'truck', 'miles', 100, 'active');
  INSERT INTO public.maintenance_schedules (
    id, farm_id, equipment_id, task_name, interval_value, last_done_reading, last_done_at
  ) VALUES
    ('${ids.schedule}', '${ids.farm}', '${ids.equipment}', 'Oil', 50, 100, '2026-10-05'),
    ('${ids.distanceSchedule}', '${ids.farm}', '${ids.distanceEquipment}', 'Tires', 500, 100, '2026-10-05');
`);

await assert.rejects(
  db.exec(`UPDATE public.equipment SET current_reading = 101 WHERE id = '${ids.equipment}'`),
  { code: '42501' },
  'ordinary updates must not bypass the meter RPCs',
);

const updateReading = (reading, force = false, farm = ids.farm) => db.query(
  'SELECT public.update_equipment_reading($1, $2, $3, $4) AS value',
  [farm, ids.equipment, reading, force],
);
await updateReading(120);
const firstTimestamp = (
  await db.query(`SELECT reading_updated_at AS value FROM public.equipment WHERE id = '${ids.equipment}'`)
).rows[0].value;
await updateReading(120);
const equalTimestamp = (
  await db.query(`SELECT reading_updated_at AS value FROM public.equipment WHERE id = '${ids.equipment}'`)
).rows[0].value;
assert.equal(equalTimestamp.toISOString(), firstTimestamp.toISOString(), 'equal readings must not bump the timestamp');
await updateReading(110);
assert.equal(
  Number((await db.query(`SELECT current_reading AS value FROM public.equipment WHERE id = '${ids.equipment}'`)).rows[0].value),
  120,
  'out-of-order readings keep the higher value',
);
await assert.rejects(updateReading(130, false, ids.otherFarm), { code: '42501' });

const logArgs = [
  ids.farm, ids.log, ids.equipment, ids.schedule, 'service', '2026-10-01', null,
  'Back-dated oil service', null, null, 20, 30, false,
];
const firstLog = await db.query(
  'SELECT public.log_maintenance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS value',
  logArgs,
);
assert.equal(firstLog.rows[0].value.already_applied, false);
const repeatedLog = await db.query(
  'SELECT public.log_maintenance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS value',
  logArgs,
);
assert.equal(repeatedLog.rows[0].value.already_applied, true, 'offline replay must be idempotent');
const baseline = (
  await db.query(`SELECT last_done_at, last_done_reading FROM public.maintenance_schedules WHERE id = '${ids.schedule}'`)
).rows[0];
assert.equal(baseline.last_done_at.toISOString().slice(0, 10), '2026-10-05');
assert.equal(Number(baseline.last_done_reading), 100, 'a missing reading must not erase the stored baseline');

await db.query(
  'SELECT public.set_equipment_meter_unit($1,$2,$3,$4,$5,$6::jsonb)',
  [ids.farm, ids.equipment, 'hours', 'miles', 700, JSON.stringify([{
    id: ids.schedule,
    interval_value: 50,
    last_done_reading: null,
  }])],
);
assert.equal(
  Number((await db.query(`SELECT last_done_reading AS value FROM public.maintenance_schedules WHERE id = '${ids.schedule}'`)).rows[0].value),
  700,
  'an hours unit change must snapshot the replacement reading when the prior baseline is null',
);

const restored = await db.query(
  'SELECT public.restore_farm_backup($1::jsonb, $2) AS value',
  [JSON.stringify({ equipment: [{
    id: ids.equipment,
    farm_id: ids.farm,
    kind: 'tractor',
    meter_unit: 'hours',
    current_reading: 80,
    status: 'active',
  }] }), 2026],
);
const restoredEquipment = (
  await db.query(`SELECT meter_unit, current_reading FROM public.equipment WHERE id = '${ids.equipment}'`)
).rows[0];
assert.equal(restored.rows[0].value.equipment, 1);
assert.deepEqual(
  [restoredEquipment.meter_unit, Number(restoredEquipment.current_reading)],
  ['hours', 80],
  'customer backup restore must replace guarded meter columns with an older snapshot',
);

await db.query(
  'SELECT public.set_equipment_meter_unit($1,$2,$3,$4,$5,$6::jsonb)',
  [ids.farm, ids.distanceEquipment, 'miles', 'km', null, null],
);
const converted = (
  await db.query(`
    SELECT e.meter_unit, e.current_reading, s.interval_value, s.last_done_reading
    FROM public.equipment e
    JOIN public.maintenance_schedules s ON s.equipment_id = e.id
    WHERE e.id = '${ids.distanceEquipment}'
  `)
).rows[0];
assert.deepEqual(
  [converted.meter_unit, Number(converted.current_reading), Number(converted.interval_value), Number(converted.last_done_reading)],
  ['km', 160.9, 804.7, 160.9],
  'distance unit conversion must update equipment and schedules together',
);

await db.query(
  'SELECT public.soft_delete_equipment_cascade($1,$2)',
  [ids.farm, ids.distanceEquipment],
);
await db.exec('RESET ROLE');
const deleted = (
  await db.query(`
    SELECT
      (SELECT deleted_at IS NOT NULL FROM public.equipment WHERE id = '${ids.distanceEquipment}') AS equipment,
      (SELECT deleted_at IS NOT NULL FROM public.maintenance_schedules WHERE id = '${ids.distanceSchedule}') AS schedule
  `)
).rows[0];
assert.deepEqual(deleted, { equipment: true, schedule: true });

// Task-name conflicts on restore, using the real per-row restore helper.
const realRestoreHelper = restoreHelperMigration.slice(
  restoreHelperMigration.indexOf('CREATE OR REPLACE FUNCTION public._restore_table_for_farm('),
  restoreHelperMigration.indexOf('CREATE OR REPLACE FUNCTION public._restore_table_for_farm_with_conflict'),
);
await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions; ${realRestoreHelper}`);
const restoredTask = '00000000-0000-4000-8000-000000000023';
const greaseTask = '00000000-0000-4000-8000-000000000024';
await db.exec(`
  INSERT INTO public.maintenance_schedules (id, farm_id, equipment_id, task_name, interval_value, deleted_at)
  VALUES ('${restoredTask}', '${ids.farm}', '${ids.equipment}', 'Oil', 250, now());
`);
const conflictResult = (
  await db.query('SELECT public.restore_farm_backup($1::jsonb) AS result', [JSON.stringify({
    maintenance_schedules: [
      { id: restoredTask, equipment_id: ids.equipment, task_name: ' oil ', interval_value: 250, deleted_at: null },
      { id: greaseTask, equipment_id: ids.equipment, task_name: 'Grease', interval_days: 30, deleted_at: null },
    ],
  })])
).rows[0].result;
assert.equal(conflictResult.maintenance_schedule_name_conflicts, 1, 'restore must report the task-name conflict');
const afterConflict = Object.fromEntries((
  await db.query(`
    SELECT id, deleted_at IS NULL AS live FROM public.maintenance_schedules
    WHERE id IN ('${ids.schedule}', '${restoredTask}', '${greaseTask}')
  `)
).rows.map(row => [row.id, row.live]));
assert.deepEqual(
  afterConflict,
  { [ids.schedule]: true, [restoredTask]: false, [greaseTask]: true },
  'a live same-name task must win; the conflicting payload task stays deleted and the rest restores',
);

// A payload that renames the live task frees its old name for a resurrected task.
const renameResult = (
  await db.query('SELECT public.restore_farm_backup($1::jsonb) AS result', [JSON.stringify({
    maintenance_schedules: [
      { id: restoredTask, equipment_id: ids.equipment, task_name: 'Oil', interval_value: 250, deleted_at: null },
      { id: ids.schedule, equipment_id: ids.equipment, task_name: 'Engine oil', interval_value: 50, deleted_at: null },
    ],
  })])
).rows[0].result;
assert.equal(renameResult.maintenance_schedule_name_conflicts, 0, 'a renamed live task is not a conflict');
const afterRename = Object.fromEntries((
  await db.query(`
    SELECT task_name, deleted_at IS NULL AS live FROM public.maintenance_schedules
    WHERE id IN ('${ids.schedule}', '${restoredTask}')
  `)
).rows.map(row => [row.task_name, row.live]));
assert.deepEqual(afterRename, { Oil: true, 'Engine oil': true }, 'rename and resurrection must both apply');

await db.close();
console.log('Equipment migration checks passed: guards, restore, task-name conflicts, higher-wins, idempotency, baselines, unit conversion, and cascade delete.');
