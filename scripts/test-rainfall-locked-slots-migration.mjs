import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: rainfall slots are stored, not recomputed from created_at.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freeFarm = uid(1);
const paidFarm = uid(2);
const restoreFarm = uid(3);
const user = uid(11);
const paidUser = uid(12);
const restoreUser = uid(13);
// Free farm, seeded BEFORE the lock migration so backfill (not the trigger) assigns slots.
// Same created_at on f105 and f106: lower id wins the second slot.
const F = {
  deleted: uid(101),
  noCoords: uid(102),
  oldest: uid(103),
  tieLow: uid(105),
  tieHigh: uid(106),
  newer: uid(107),
  nullCreated: uid(108),
  backdated: uid(109),
  third: uid(110),
};
const P = [uid(201), uid(202), uid(203)];
const R = [uid(301), uid(302), uid(303)];
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const asUser = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const rows = async (sql) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  const r = (await db.query(sql)).rows;
  await db.exec('RESET ROLE');
  return r;
};
const ids = (r) => r.map((x) => x.id ?? x.rainfall_slot_field_ids ?? x.farm_rainfall_field_ids);
const slots = async (farm) => (await rows(
  `SELECT slot, field_id FROM public.farm_rainfall_slots WHERE farm_id = '${farm}' ORDER BY slot`,
)).map((r) => [r.slot, r.field_id]);
const isRainfallLock = (e) => e.code === 'P0402' && /premium_required:rainfall/.test(e.message);
const denied = /permission denied/;

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.farms (id uuid PRIMARY KEY, trial_ends_at timestamptz);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    CREATE TABLE public.farm_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      status text NOT NULL, current_period_end timestamptz, deleted_at timestamptz);
    CREATE TABLE public.farm_comps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      reason text NOT NULL, expires_at timestamptz, deleted_at timestamptz);
    CREATE TABLE public.fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      name text, lat numeric, lng numeric, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${freeFarm}'), ('${paidFarm}'), ('${restoreFarm}');
    INSERT INTO public.profiles VALUES ('${user}', '${freeFarm}'), ('${paidUser}', '${paidFarm}'), ('${restoreUser}', '${restoreFarm}');
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.fields TO authenticated;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  await db.exec(await mig('20261107040000_rainfall_tiering.sql'));

  await svc(`
    INSERT INTO public.fields (id, farm_id, name, lat, lng, deleted_at, created_at) VALUES
      ('${F.deleted}', '${freeFarm}', 'deleted-oldest', 38.5, -93.5, now(), '2019-01-01T00:00:00Z'),
      ('${F.noCoords}', '${freeFarm}', 'no-coords', NULL, NULL, NULL, '2018-01-01T00:00:00Z'),
      ('${F.oldest}', '${freeFarm}', 'oldest', 38.5, -93.5, NULL, '2021-01-01T00:00:00Z'),
      ('${F.tieLow}', '${freeFarm}', 'tie-low', 38.6, -93.6, NULL, '2022-01-01T00:00:00Z'),
      ('${F.tieHigh}', '${freeFarm}', 'tie-high', 38.7, -93.7, NULL, '2022-01-01T00:00:00Z'),
      ('${F.newer}', '${freeFarm}', 'newer', 38.8, -93.8, NULL, '2023-01-01T00:00:00Z'),
      ('${F.nullCreated}', '${freeFarm}', 'null-created', 38.9, -93.9, NULL, NULL);
    INSERT INTO public.fields (id, farm_id, name, lat, lng, created_at) VALUES
      ('${P[0]}', '${paidFarm}', 'p-oldest', 40, -90, '2015-01-01T00:00:00Z'),
      ('${P[1]}', '${paidFarm}', 'p-mid', 40, -90, '2016-01-01T00:00:00Z'),
      ('${P[2]}', '${paidFarm}', 'p-new', 40, -90, '2017-01-01T00:00:00Z');
  `);

  const locked = await mig('20261110170000_rainfall_locked_slots.sql');
  await db.exec(locked);
  await db.exec(locked); // replay is idempotent

  // Backfill: oldest eligible, then the lower id on a created_at tie. Deleted, no-coords, and NULL created_at lose.
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);
  assert.deepEqual(await slots(paidFarm), [[1, P[0]], [2, P[1]]]);
  assert.deepEqual(ids(await rows(`SELECT public.rainfall_slot_field_ids('${freeFarm}') AS rainfall_slot_field_ids`)), [F.oldest, F.tieLow]);
  // Stored slots only — a paid farm's third field is not a slot, even though hourly collection still covers it.
  assert.deepEqual(ids(await rows(`SELECT public.rainfall_slot_field_ids('${paidFarm}') AS rainfall_slot_field_ids`)), [P[0], P[1]]);

  const collect = async (tier) => ids(await rows(`SELECT id FROM public.rainfall_collectable_fields('${tier}', NULL, 100)`));
  assert.deepEqual((await collect('daily_any')).sort(), [F.oldest, F.tieLow].sort());
  assert.deepEqual(await collect('daily'), []); // mode is still off
  await mode('shadow');
  assert.deepEqual((await collect('daily')).sort(), [F.oldest, F.tieLow].sort());
  await mode('off');

  // Clients cannot touch the slots table or the service-only helper.
  await asUser(user);
  await assert.rejects(db.query('SELECT * FROM public.farm_rainfall_slots'), denied);
  await assert.rejects(db.query(`INSERT INTO public.farm_rainfall_slots (farm_id, slot, field_id) VALUES ('${freeFarm}', 1, '${F.newer}')`), denied);
  await assert.rejects(db.query(`UPDATE public.farm_rainfall_slots SET slot = 1 WHERE farm_id = '${freeFarm}'`), denied);
  await assert.rejects(db.query(`DELETE FROM public.farm_rainfall_slots WHERE farm_id = '${freeFarm}'`), denied);
  await assert.rejects(db.query(`SELECT public.rainfall_slot_field_ids('${freeFarm}')`), denied);
  await assert.rejects(db.query(`SELECT * FROM public.rainfall_collectable_fields('daily_any')`), denied);
  // Members see their own farm. A paid farm has no slot cap, so the RPC is every eligible field.
  assert.deepEqual(ids((await db.query(`SELECT public.farm_rainfall_field_ids('${freeFarm}') AS farm_rainfall_field_ids`)).rows).sort(), [F.oldest, F.tieLow].sort());
  assert.deepEqual((await db.query(`SELECT public.farm_rainfall_field_ids('${paidFarm}') AS x`)).rows, []);
  await asUser(paidUser);
  assert.deepEqual(ids((await db.query(`SELECT public.farm_rainfall_field_ids('${paidFarm}') AS farm_rainfall_field_ids`)).rows).sort(), [...P].sort());
  assert.deepEqual((await db.query(`SELECT public.farm_rainfall_field_ids('${freeFarm}') AS x`)).rows, []);
  await db.exec('RESET ROLE');

  // Client UPDATE of created_at is ignored. The rest of the row still saves.
  await asUser(user);
  await db.exec(`UPDATE public.fields SET created_at = '1990-01-01', name = 'renamed' WHERE id = '${F.oldest}'`);
  await db.exec('RESET ROLE');
  const renamed = (await rows(`SELECT name, created_at FROM public.fields WHERE id = '${F.oldest}'`))[0];
  assert.equal(renamed.name, 'renamed');
  assert.equal(new Date(renamed.created_at).toISOString(), '2021-01-01T00:00:00.000Z');
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);

  // service_role (no auth.uid()) may correct created_at, and that does not reshuffle a full slot list.
  await svc(`UPDATE public.fields SET created_at = '2023-06-01T00:00:00Z' WHERE id = '${F.newer}'`);
  assert.equal(new Date((await rows(`SELECT created_at FROM public.fields WHERE id = '${F.newer}'`))[0].created_at).toISOString(), '2023-06-01T00:00:00.000Z');
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);

  // Client INSERT with a backdated created_at is stamped now() and does not take a slot.
  await asUser(user);
  await db.exec(`INSERT INTO public.fields (id, farm_id, name, lat, lng, created_at) VALUES ('${F.backdated}', '${freeFarm}', 'backdated', 38.1, -93.1, '2000-01-01')`);
  await db.exec('RESET ROLE');
  const stamped = (await rows(`SELECT created_at > now() - interval '2 minutes' AND created_at < now() + interval '2 minutes' AS fresh FROM public.fields WHERE id = '${F.backdated}'`))[0];
  assert.equal(stamped.fresh, true);
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);

  // A third field created while two slots exist never receives one.
  await asUser(user);
  await db.exec(`INSERT INTO public.fields (id, farm_id, name, lat, lng) VALUES ('${F.third}', '${freeFarm}', 'third', 38.2, -93.2)`);
  await db.exec('RESET ROLE');
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);

  // Clearing coordinates keeps the slot. The next field is not promoted.
  await asUser(user);
  await db.exec(`UPDATE public.fields SET lat = NULL, lng = NULL WHERE id = '${F.tieLow}'`);
  await db.exec('RESET ROLE');
  assert.deepEqual(await slots(freeFarm), [[1, F.oldest], [2, F.tieLow]]);
  assert.deepEqual(ids(await rows(`SELECT public.rainfall_slot_field_ids('${freeFarm}') AS rainfall_slot_field_ids`)), [F.oldest]);
  assert.deepEqual(await collect('daily_any'), [F.oldest]);

  await svc(`UPDATE public.fields SET lat = 38.6, lng = -93.6 WHERE id = '${F.tieLow}'`);
  assert.deepEqual(ids(await rows(`SELECT public.rainfall_slot_field_ids('${freeFarm}') AS rainfall_slot_field_ids`)), [F.oldest, F.tieLow]);

  // Soft-delete releases the slot and refills with the next oldest (tie-break id, NULL created_at last).
  await asUser(user);
  await db.exec(`UPDATE public.fields SET deleted_at = now() WHERE id = '${F.oldest}'`);
  await db.exec('RESET ROLE');
  assert.deepEqual(await slots(freeFarm), [[1, F.tieHigh], [2, F.tieLow]]);

  // Restoring the old slot field does not take the slot back.
  await asUser(user);
  await db.exec(`UPDATE public.fields SET deleted_at = NULL WHERE id = '${F.oldest}'`);
  await db.exec('RESET ROLE');
  assert.deepEqual(await slots(freeFarm), [[1, F.tieHigh], [2, F.tieLow]]);
  assert.deepEqual(ids(await rows(`SELECT public.rainfall_slot_field_ids('${freeFarm}') AS rainfall_slot_field_ids`)), [F.tieHigh, F.tieLow]);

  // Read gate follows the stored slots.
  await mode('enforce');
  await asUser(user);
  const readDaily = (field) => db.query(`SELECT rain_date FROM public.get_field_rainfall_daily('${field}', '2026-07-01', '2026-07-31')`);
  assert.deepEqual((await readDaily(F.tieHigh)).rows, []);
  await assert.rejects(readDaily(F.oldest), isRainfallLock);
  await assert.rejects(readDaily(F.newer), isRainfallLock);
  assert.deepEqual((await readDaily(P[2])).rows, []);
  await db.exec('RESET ROLE');
  await mode('off');

  // Restore wrapper sets acreledger.restoring, so inserted fields keep their ages.
  // Deferred assignment then locks the two oldest, not the first two inserted.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public._restore_farm_backup_impl(p_payload jsonb, p_active_season integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    DECLARE
      v_farm uuid;
      v_field jsonb;
    BEGIN
      SELECT farm_id INTO v_farm FROM public.profiles WHERE id = auth.uid();
      FOR v_field IN SELECT value FROM jsonb_array_elements(p_payload->'fields')
      LOOP
        INSERT INTO public.fields (id, farm_id, name, lat, lng, created_at)
        VALUES (
          (v_field->>'id')::uuid,
          v_farm,
          'restored',
          39,
          -94,
          (v_field->>'created_at')::timestamptz
        );
      END LOOP;
      RETURN '{"ok":true}'::jsonb;
    END;
    $fn$;
  `);
  await asUser(restoreUser);
  await db.query(`
    SELECT public.restore_farm_backup(jsonb_build_object('fields', jsonb_build_array(
      jsonb_build_object('id', '${R[0]}', 'created_at', '2024-01-01T00:00:00Z'),
      jsonb_build_object('id', '${R[1]}', 'created_at', '2020-01-01T00:00:00Z'),
      jsonb_build_object('id', '${R[2]}', 'created_at', '2022-01-01T00:00:00Z')
    )), NULL)
  `);
  await db.exec('RESET ROLE');
  const restoredAges = await rows(`SELECT id, created_at FROM public.fields WHERE farm_id = '${restoreFarm}' ORDER BY created_at`);
  assert.deepEqual(restoredAges.map((r) => [r.id, new Date(r.created_at).toISOString()]), [
    [R[1], '2020-01-01T00:00:00.000Z'],
    [R[2], '2022-01-01T00:00:00.000Z'],
    [R[0], '2024-01-01T00:00:00.000Z'],
  ]);
  assert.deepEqual(await slots(restoreFarm), [[1, R[1]], [2, R[2]]]);

  // Unauthenticated callers are rejected before the impl runs.
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE authenticated`);
  await assert.rejects(db.query(`SELECT public.restore_farm_backup('{}'::jsonb, NULL)`), /Authentication required/);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query(`SELECT public.restore_farm_backup('{}'::jsonb, NULL)`), denied);

  console.log('Rainfall locked slots: backfill tie-break, created_at lock, coord clear, refill, restore, and RPC scope passed.');
} finally {
  await db.close();
}
