import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: rainfall tiering (slots, collectable fields per mode, read gate, daily seed).
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freeFarm = uid(1);
const paidFarm = uid(2);
const user = uid(3);
const outsider = uid(4);
// Free farm fields. Slot order should be: f2 (oldest), f4 (next) -- f1 is deleted, f3 has no coords, f5 is newer, f6 has NULL created_at.
const F = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`f${n}`, uid(100 + n)]));
const P = [uid(201), uid(202), uid(203)];
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const asUser = (u = user) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const rows = async (sql) => { await db.exec('RESET ROLE; SET ROLE service_role'); const r = (await db.query(sql)).rows; await db.exec('RESET ROLE'); return r; };
const ids = (r) => r.map((x) => x.id ?? x.rainfall_slot_field_ids ?? x.farm_rainfall_field_ids);
const collect = async (tier, after = null, limit = 1000) =>
  ids(await rows(`SELECT * FROM public.rainfall_collectable_fields('${tier}', ${after ? `'${after}'` : 'NULL'}, ${limit})`));
const isRainfallLock = (e) => e.code === 'P0402' && /premium_required:rainfall/.test(e.message);
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
    -- Baseline-shaped fields table WITHOUT created_at: the migration must add it (drift fix).
    CREATE TABLE public.fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      name text, lat numeric, lng numeric, deleted_at timestamptz);
    CREATE TABLE public.field_rainfall_hourly (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, field_id uuid NOT NULL REFERENCES public.fields ON DELETE CASCADE,
      timestamp_utc timestamptz NOT NULL, rainfall_in numeric DEFAULT 0, source text, finalized boolean DEFAULT false, UNIQUE (field_id, timestamp_utc));
    INSERT INTO public.farms VALUES ('${freeFarm}'), ('${paidFarm}');
    INSERT INTO public.profiles VALUES ('${user}', '${freeFarm}'), ('${outsider}', '${paidFarm}');
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  const tiering = await mig('20261107040000_rainfall_tiering.sql');
  await db.exec(tiering); await db.exec(tiering); // replay

  // Fields (free farm): coordinates everywhere except f3; f1 deleted.
  await svc(`
    INSERT INTO public.fields (id, farm_id, name, lat, lng, deleted_at) VALUES
      ('${F.f1}', '${freeFarm}', 'deleted-oldest', 38.5, -93.5, now()),
      ('${F.f2}', '${freeFarm}', 'oldest', 38.5, -93.5, NULL),
      ('${F.f3}', '${freeFarm}', 'no-coords', NULL, NULL, NULL),
      ('${F.f4}', '${freeFarm}', 'second', 38.6, -93.6, NULL),
      ('${F.f5}', '${freeFarm}', 'newer', 38.7, -93.7, NULL),
      ('${F.f6}', '${freeFarm}', 'null-created', 38.8, -93.8, NULL);
    INSERT INTO public.fields (id, farm_id, name, lat, lng) VALUES
      ('${P[0]}', '${paidFarm}', 'p1', 40, -90), ('${P[1]}', '${paidFarm}', 'p2', 40, -90), ('${P[2]}', '${paidFarm}', 'p3', 40, -90);
    UPDATE public.fields SET created_at = '2020-01-01' WHERE id = '${F.f1}';
    UPDATE public.fields SET created_at = '2021-01-01' WHERE id = '${F.f2}';
    UPDATE public.fields SET created_at = '2021-06-01' WHERE id = '${F.f3}';
    UPDATE public.fields SET created_at = '2022-01-01' WHERE id = '${F.f4}';
    UPDATE public.fields SET created_at = '2023-01-01' WHERE id = '${F.f5}';
    UPDATE public.fields SET created_at = NULL WHERE id = '${F.f6}';`);

  // Slot rule: 2 oldest ELIGIBLE (active + coords), NULL created_at last.
  const slots = ids(await rows(`SELECT public.rainfall_slot_field_ids('${freeFarm}') AS rainfall_slot_field_ids`));
  assert.deepEqual(slots, [F.f2, F.f4]);
  // Paid farm: all eligible fields.
  assert.equal((await rows(`SELECT public.rainfall_slot_field_ids('${paidFarm}') AS x`)).length, 3);

  // Hourly tier: off/shadow = every eligible field; enforce = paid farms only.
  const allEligible = [F.f2, F.f4, F.f5, F.f6, ...P].sort();
  assert.deepEqual((await collect('hourly')).sort(), allEligible);
  await mode('shadow');
  assert.deepEqual((await collect('hourly')).sort(), allEligible);
  await mode('enforce');
  assert.deepEqual((await collect('hourly')).sort(), [...P].sort());
  // Daily tier: slot fields of free farms only, and nothing at all while mode = 'off'.
  assert.deepEqual((await collect('daily')).sort(), [F.f2, F.f4].sort());
  await mode('shadow');
  assert.deepEqual((await collect('daily')).sort(), [F.f2, F.f4].sort());
  await mode('off');
  assert.deepEqual(await collect('daily'), []);
  assert.deepEqual((await collect('daily_any')).sort(), [F.f2, F.f4].sort());
  // A comped farm is not "free": drops out of the daily tier.
  await svc(`INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${freeFarm}', 'comp')`);
  assert.deepEqual(await collect('daily_any'), []);
  await svc(`UPDATE public.farm_comps SET deleted_at = now()`);

  // Keyset pagination: pages of 2 cover everything once, in id order, then a short page.
  const seen = []; let after = null;
  for (let i = 0; i < 10; i++) {
    const page = await collect('hourly', after, 2);
    seen.push(...page);
    if (page.length < 2) break;
    after = page[page.length - 1];
  }
  assert.deepEqual(seen, [...allEligible]);
  await assert.rejects(db.query(`SELECT public.rainfall_collectable_fields('weekly')`), /unknown rainfall tier/);

  // Client privileges.
  await asUser();
  await assert.rejects(db.query(`SELECT * FROM public.rainfall_collectable_fields('hourly')`), /permission denied/);
  await assert.rejects(db.query(`SELECT * FROM public.field_rainfall_daily`), /permission denied/);
  await assert.rejects(db.query(`SELECT * FROM public.mrms_daily_runs`), /permission denied/);
  await assert.rejects(db.query(`SELECT public.rainfall_slot_field_ids('${freeFarm}')`), /permission denied/);
  // Members see their own farm's rainfall fields; non-members get nothing.
  assert.deepEqual(ids((await db.query(`SELECT public.farm_rainfall_field_ids('${freeFarm}') AS farm_rainfall_field_ids`)).rows).sort(), [F.f2, F.f4].sort());
  assert.deepEqual((await db.query(`SELECT public.farm_rainfall_field_ids('${paidFarm}') AS x`)).rows, []);
  await db.exec('RESET ROLE');

  // Seed from hourly: day D = 2026-07-15 (CDT, UTC-5) is the 24 hours ending 08:00 local = 13:00Z on the 15th.
  const hourly = (field, startIso, n, fin = true) =>
    `INSERT INTO public.field_rainfall_hourly (field_id, timestamp_utc, rainfall_in, finalized)
       SELECT '${field}', ('${startIso}'::timestamptz + (g || ' hours')::interval), 0.01, ${fin} FROM generate_series(0, ${n - 1}) g`;
  await svc(`${hourly(F.f2, '2026-07-14T14:00:00Z', 24)}`);       // full day -> 2026-07-15, 0.24 in
  await svc(`${hourly(F.f2, '2026-07-15T14:00:00Z', 5)}`);        // partial next day -> not seeded
  await svc(`${hourly(F.f4, '2026-07-14T14:00:00Z', 24, false)}`); // not finalized -> not seeded
  await svc(`${hourly(F.f5, '2026-07-14T14:00:00Z', 24)}`);       // not a slot field -> not seeded
  assert.equal((await rows(`SELECT public.seed_field_rainfall_daily_from_hourly() AS n`))[0].n, 1);
  const daily = await rows(`SELECT field_id, rain_date::text AS d, rainfall_in::float AS inches, source FROM public.field_rainfall_daily ORDER BY field_id, rain_date`);
  assert.deepEqual(daily, [{ field_id: F.f2, d: '2026-07-15', inches: 0.24, source: 'MRMS 01H sum' }]);
  // Idempotent, and never overwrites a real daily row.
  assert.equal((await rows(`SELECT public.seed_field_rainfall_daily_from_hourly() AS n`))[0].n, 0);
  await svc(`UPDATE public.field_rainfall_daily SET rainfall_in = 9, source = 'MRMS 24H'`);
  assert.equal((await rows(`SELECT public.seed_field_rainfall_daily_from_hourly('${F.f2}') AS n`))[0].n, 0);
  assert.equal((await rows(`SELECT rainfall_in::float AS i FROM public.field_rainfall_daily`))[0].i, 9);
  // Real daily rows for a non-slot field (e.g. it was a slot before another field aged in).
  await svc(`INSERT INTO public.field_rainfall_daily (field_id, rain_date, rainfall_in) VALUES ('${F.f5}', '2026-07-15', 0.5), ('${F.f4}', '2026-07-15', 0.1)`);

  // Read gate (client): mode off -> any field of my farm; enforce -> slot fields only.
  const readDaily = (field) => db.query(`SELECT rain_date::text AS d, rainfall_in::float AS i FROM public.get_field_rainfall_daily('${field}', '2026-07-01', '2026-07-31')`);
  await asUser();
  assert.deepEqual((await readDaily(F.f5)).rows, [{ d: '2026-07-15', i: 0.5 }]);
  await db.exec('RESET ROLE'); await mode('enforce'); await asUser();
  assert.deepEqual((await readDaily(F.f2)).rows, [{ d: '2026-07-15', i: 9 }]);
  assert.deepEqual((await readDaily(F.f4)).rows, [{ d: '2026-07-15', i: 0.1 }]);
  await assert.rejects(readDaily(F.f5), isRainfallLock);   // newer non-slot field is locked
  await assert.rejects(readDaily(F.f6), isRainfallLock);   // NULL created_at sorts last
  assert.deepEqual((await readDaily(P[0])).rows, []);       // another farm's field: no rows, no error
  // A paid farm member is never locked.
  await asUser(outsider);
  assert.deepEqual((await readDaily(P[0])).rows, []);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(readDaily(F.f2), /permission denied/);
  console.log('Rainfall tiering: replay, created_at drift fix, slot order, collectable fields per mode, pagination, read gate, seed passed.');
} finally {
  await db.close();
}
