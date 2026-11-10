import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: revoke internal entitlement helpers, allowlist + shadow
// rate limit on assert_premium, drop the photo cap guard, trialing is not Pro.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const user = '22222222-2222-4222-8222-222222222222';
const f1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const f2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const f3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const sprayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const photo = '[ATTACHMENT:data:image/png;base64,AAAA]';
const mig = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
const codeIs = (code) => (err) => err.code === code;
const shadowCount = async (feature, farmId = farm) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  const n = (await db.query(
    `SELECT count(*)::int AS n FROM public.entitlement_shadow_log WHERE farm_id = '${farmId}' AND feature = '${feature}'`,
  )).rows[0].n;
  await db.exec('RESET ROLE');
  return n;
};
const photoTriggers = async () => (await db.query(`
  SELECT t.tgname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'spray_records'
    AND t.tgname IN ('guard_photo_cap_insert', 'guard_photo_cap_update')
    AND NOT t.tgisinternal
  ORDER BY 1
`)).rows.map((row) => row.tgname);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.farms (id uuid PRIMARY KEY, trial_ends_at timestamptz);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    CREATE TABLE public.farm_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      status text NOT NULL, current_period_end timestamptz, deleted_at timestamptz);
    CREATE TABLE public.farm_comps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      reason text NOT NULL, expires_at timestamptz, deleted_at timestamptz);
    CREATE TABLE public.fields (
      id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms,
      name text, lat numeric, lng numeric, deleted_at timestamptz);
    CREATE TABLE public.field_rainfall_hourly (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES public.fields ON DELETE CASCADE,
      timestamp_utc timestamptz NOT NULL, rainfall_in numeric DEFAULT 0, source text, finalized boolean DEFAULT false);
    CREATE TABLE public.spray_records (
      id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, notes text, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}'), ('${other}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.spray_records TO authenticated;
    GRANT SELECT ON public.fields TO authenticated;
  `);

  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  await db.exec(await mig('20261107030000_photo_cap_guard.sql'));
  await db.exec(await mig('20261107040000_rainfall_tiering.sql'));
  await db.exec(await mig('20261107060000_rainfall_hourly_field_allowed.sql'));
  await db.exec(await mig('20261110160000_billing_past_due_since.sql'));
  await db.exec(await mig('20261110170000_rainfall_locked_slots.sql'));

  assert.deepEqual(await photoTriggers(), ['guard_photo_cap_insert', 'guard_photo_cap_update']);
  assert.notEqual((await db.query(`SELECT to_regprocedure('public.guard_photo_cap()') AS fn`)).rows[0].fn, null);

  await db.exec(`
    INSERT INTO public.spray_records (id, farm_id, notes) VALUES ('${sprayId}', '${farm}', 'keep ${photo}');
    INSERT INTO public.fields (id, farm_id, name, lat, lng, created_at) VALUES
      ('${f1}', '${farm}', 'oldest', 38.5, -93.5, '2020-01-01'),
      ('${f2}', '${farm}', 'middle', 38.6, -93.6, '2021-01-01'),
      ('${f3}', '${farm}', 'newest', 38.7, -93.7, '2022-01-01');
    INSERT INTO public.field_rainfall_daily (field_id, rain_date, rainfall_in, finalized) VALUES
      ('${f1}', '2026-06-01', 0.4, true),
      ('${f3}', '2026-06-01', 0.2, true);
  `);

  const hardening = await mig('20261110190000_entitlements_hardening.sql');
  await db.exec(hardening);
  await db.exec(hardening);

  assert.deepEqual(await photoTriggers(), []);
  assert.equal((await db.query(`SELECT to_regprocedure('public.guard_photo_cap()') AS fn`)).rows[0].fn, null);
  const kept = (await db.query(`SELECT notes FROM public.spray_records WHERE id = '${sprayId}'`)).rows[0];
  assert.equal(kept.notes, `keep ${photo}`);

  const priv = (await db.query(`
    SELECT
      has_function_privilege('public', 'public.entitlements_mode()', 'EXECUTE') AS public_mode,
      has_function_privilege('anon', 'public.entitlements_mode()', 'EXECUTE') AS anon_mode,
      has_function_privilege('authenticated', 'public.entitlements_mode()', 'EXECUTE') AS auth_mode,
      has_function_privilege('service_role', 'public.entitlements_mode()', 'EXECUTE') AS svc_mode,
      has_function_privilege('public', 'public.entitlement_free_limits()', 'EXECUTE') AS public_limits,
      has_function_privilege('anon', 'public.entitlement_free_limits()', 'EXECUTE') AS anon_limits,
      has_function_privilege('authenticated', 'public.entitlement_free_limits()', 'EXECUTE') AS auth_limits,
      has_function_privilege('service_role', 'public.entitlement_free_limits()', 'EXECUTE') AS svc_limits,
      has_function_privilege('anon', 'public.assert_premium(uuid, text)', 'EXECUTE') AS anon_assert,
      has_function_privilege('authenticated', 'public.assert_premium(uuid, text)', 'EXECUTE') AS auth_assert,
      has_function_privilege('service_role', 'public.assert_premium(uuid, text)', 'EXECUTE') AS svc_assert,
      has_function_privilege('authenticated', 'public.farm_entitlement(uuid)', 'EXECUTE') AS auth_farm,
      has_function_privilege('authenticated', 'public.farm_rainfall_field_ids(uuid)', 'EXECUTE') AS auth_rain,
      has_function_privilege('authenticated', 'public.get_field_rainfall_daily(uuid, date, date)', 'EXECUTE') AS auth_daily
  `)).rows[0];
  for (const key of ['public_mode', 'anon_mode', 'auth_mode', 'public_limits', 'anon_limits', 'auth_limits', 'anon_assert']) {
    assert.equal(priv[key], false, key);
  }
  for (const key of ['svc_mode', 'svc_limits', 'auth_assert', 'svc_assert', 'auth_farm', 'auth_rain', 'auth_daily']) {
    assert.equal(priv[key], true, key);
  }

  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.query('SELECT public.entitlements_mode()'), /permission denied/);
  await assert.rejects(db.query('SELECT * FROM public.entitlement_free_limits()'), /permission denied/);
  await assert.rejects(db.query(`SELECT public.assert_premium('${farm}', 'grain')`), /permission denied/);
  await db.exec('RESET ROLE');

  await asUser();
  await assert.rejects(db.query('SELECT public.entitlements_mode()'), /permission denied/);
  await assert.rejects(db.query('SELECT * FROM public.entitlement_free_limits()'), /permission denied/);
  const member = (await db.query(`
    SELECT plan, field_cap, photo_cap, rainfall_slot_cap, enforced
    FROM public.farm_entitlement('${farm}')
  `)).rows[0];
  assert.equal(member.plan, 'free');
  assert.equal(member.field_cap, 50);
  assert.equal(member.photo_cap, null);
  assert.equal(member.rainfall_slot_cap, 2);
  assert.equal(member.enforced, false);
  const rainIds = (await db.query(`SELECT public.farm_rainfall_field_ids('${farm}') AS id`)).rows.map((row) => row.id);
  assert.deepEqual(rainIds, [f1, f2]);
  const daily = (await db.query(`
    SELECT rain_date::text AS rain_date FROM public.get_field_rainfall_daily('${f1}', '2026-01-01', '2026-12-31')
  `)).rows;
  assert.deepEqual(daily, [{ rain_date: '2026-06-01' }]);
  const unlocked = (await db.query(`
    SELECT rain_date::text AS rain_date FROM public.get_field_rainfall_daily('${f3}', '2026-01-01', '2026-12-31')
  `)).rows;
  assert.deepEqual(unlocked, [{ rain_date: '2026-06-01' }]);
  await db.exec('RESET ROLE');

  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  assert.equal((await db.query('SELECT public.entitlements_mode() AS m')).rows[0].m, 'off');
  const limitRow = (await db.query('SELECT * FROM public.entitlement_free_limits()')).rows[0];
  await db.exec('RESET ROLE');
  assert.equal(limitRow.field_cap, 50);
  assert.equal(limitRow.rainfall_slot_cap, 2);
  assert.equal(limitRow.photo_cap, null);
  assert.equal(limitRow.history_seasons, 2);
  assert.equal(limitRow.device_cap, 1);

  // Latest _farm_entitlement (20261110160000): trialing is the free record book.
  await db.exec(`
    INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end)
    VALUES ('${farm}', 'trialing', now() + interval '1 year')
  `);
  let plan = (await db.query(`SELECT plan, field_cap, photo_cap FROM public._farm_entitlement('${farm}')`)).rows[0];
  assert.equal(plan.plan, 'free', 'trialing');
  assert.equal(plan.field_cap, 50);
  assert.equal(plan.photo_cap, null);
  await db.exec(`UPDATE public.farm_subscriptions SET deleted_at = now() WHERE farm_id = '${farm}' AND deleted_at IS NULL`);
  await db.exec(`
    INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end)
    VALUES ('${farm}', 'active', now() + interval '20 days')
  `);
  plan = (await db.query(`SELECT plan, field_cap, photo_cap FROM public._farm_entitlement('${farm}')`)).rows[0];
  assert.equal(plan.plan, 'paid', 'active');
  assert.equal(plan.field_cap, null);
  assert.equal(plan.photo_cap, null);
  await db.exec(`UPDATE public.farm_subscriptions SET deleted_at = now() WHERE farm_id = '${farm}' AND deleted_at IS NULL`);
  assert.equal((await db.query(`SELECT plan FROM public._farm_entitlement('${farm}')`)).rows[0].plan, 'free');

  await svc(`UPDATE public.entitlement_config SET mode = 'off'`);
  const allowed = ['reports', 'grain', 'equipment', 'landlord_split', 'fsa_tract', 'backup_restore', 'field_cap', 'rainfall'];
  for (const feature of allowed) {
    await svc(`SELECT public.assert_premium('${farm}', '${feature}')`);
  }
  await assert.rejects(svc(`SELECT public.assert_premium('${farm}', 'photo_cap')`), codeIs('22023'));
  await assert.rejects(svc(`SELECT public.assert_premium('${farm}', 'not_a_feature')`), codeIs('22023'));
  await assert.rejects(svc(`SELECT public.assert_premium('${farm}', NULL)`), codeIs('22023'));
  assert.equal(await shadowCount('photo_cap'), 0);
  assert.equal(await shadowCount('grain'), 0);

  await svc(`UPDATE public.entitlement_config SET mode = 'shadow'`);
  await assert.rejects(svc(`SELECT public.assert_premium('${farm}', 'spray_photos')`), codeIs('22023'));
  assert.equal(await shadowCount('spray_photos'), 0);
  await svc(`SELECT public.assert_premium('${farm}', 'grain')`);
  await svc(`SELECT public.assert_premium('${farm}', 'grain')`);
  assert.equal(await shadowCount('grain'), 1);
  await svc(`SELECT public.assert_premium('${farm}', 'equipment')`);
  assert.equal(await shadowCount('equipment'), 1);
  await svc(`SELECT public.assert_premium('${other}', 'grain')`);
  assert.equal(await shadowCount('grain', other), 1);
  await db.exec(`
    RESET ROLE;
    UPDATE public.entitlement_shadow_log
    SET created_at = now() - interval '2 minutes'
    WHERE farm_id = '${farm}' AND feature = 'grain'
  `);
  await svc(`SELECT public.assert_premium('${farm}', 'grain')`);
  assert.equal(await shadowCount('grain'), 2);

  await svc(`UPDATE public.entitlement_config SET mode = 'enforce'`);
  await asUser();
  await assert.rejects(db.query(`SELECT public.assert_premium('${farm}', 'reports')`), codeIs('P0402'));
  await assert.rejects(db.query(`SELECT public.assert_premium('${other}', 'grain')`), codeIs('42501'));
  await assert.rejects(db.query(`SELECT public.assert_premium('${other}', 'nope')`), codeIs('22023'));
  await db.exec(`INSERT INTO public.spray_records (id, farm_id, notes) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '${farm}', 'after ${photo}')`);
  await assert.rejects(
    db.query(`SELECT * FROM public.get_field_rainfall_daily('${f3}', '2026-01-01', '2026-12-31')`),
    (err) => err.code === 'P0402' && /premium_required:rainfall/.test(err.message),
  );
  const slotDaily = (await db.query(`
    SELECT rain_date::text AS rain_date FROM public.get_field_rainfall_daily('${f1}', '2026-01-01', '2026-12-31')
  `)).rows;
  assert.deepEqual(slotDaily, [{ rain_date: '2026-06-01' }]);
  const enforced = (await db.query(`SELECT enforced, photo_cap FROM public.farm_entitlement('${farm}')`)).rows[0];
  assert.equal(enforced.enforced, true);
  assert.equal(enforced.photo_cap, null);
  await db.exec('RESET ROLE');

  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  const hourly = (await db.query(`SELECT id FROM public.rainfall_collectable_fields('hourly', NULL, 100) ORDER BY id`)).rows.map((row) => row.id);
  const allowedHourly = (await db.query(`SELECT public.rainfall_field_hourly_allowed('${f1}') AS ok`)).rows[0].ok;
  await db.exec('RESET ROLE');
  assert.deepEqual(hourly, []);
  assert.equal(allowedHourly, false);
  await svc(`UPDATE public.entitlement_config SET mode = 'off'`);
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  const hourlyOff = (await db.query(`SELECT id FROM public.rainfall_collectable_fields('hourly', NULL, 100) ORDER BY id`)).rows.map((row) => row.id);
  const allowedOff = (await db.query(`SELECT public.rainfall_field_hourly_allowed('${f1}') AS ok`)).rows[0].ok;
  await db.exec('RESET ROLE');
  assert.deepEqual(hourlyOff, [f1, f2, f3]);
  assert.equal(allowedOff, true);

  const photosLeft = (await db.query(`SELECT count(*)::int AS n FROM public.spray_records WHERE farm_id = '${farm}'`)).rows[0].n;
  assert.equal(photosLeft, 2);

  console.log('Entitlements hardening: revoke, allowlist, shadow rate limit, photo guard drop, trialing, rainfall passed.');
} finally {
  await db.close();
}
