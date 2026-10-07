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
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
  INSERT INTO public.farms (id) VALUES ('${ids.farm}'), ('${ids.otherFarm}');
  INSERT INTO public.profiles (id, farm_id) VALUES ('${ids.user}', '${ids.farm}');
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT SELECT ON public.profiles TO authenticated;
`);
await db.exec(schemaMigration);
await db.exec(rpcMigration);
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

await db.close();
console.log('Equipment migration checks passed: guards, higher-wins, idempotency, baselines, unit conversion, and cascade delete.');
