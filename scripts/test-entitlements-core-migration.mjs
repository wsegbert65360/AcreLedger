import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable in-process Postgres. Covers plan resolution, modes, privileges and replay.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const user = '22222222-2222-4222-8222-222222222222';
const asService = async (sql) => { await db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`); };
const plan = async (f = farm) => (await db.query(`SELECT * FROM public._farm_entitlement('${f}')`)).rows[0];
const setMode = (m) => asService(`UPDATE public.entitlement_config SET mode = '${m}'`);
const resetFarm = () => asService(`
  UPDATE public.farm_comps SET deleted_at = now() WHERE farm_id = '${farm}';
  UPDATE public.farm_subscriptions SET deleted_at = now() WHERE farm_id = '${farm}';
  UPDATE public.farms SET trial_ends_at = NULL WHERE id = '${farm}'`);
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
    CREATE TABLE public.spray_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid, notes text, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}'), ('${other}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  const sql = await readFile(new URL('../supabase/migrations/20261107000000_entitlements_core.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // replay
  // Original file still selects photo_cap 20. Hardening keeps the column and returns NULL.
  assert.match(sql, /20 AS photo_cap/);
  const hardening = await readFile(new URL('../supabase/migrations/20261110190000_entitlements_hardening.sql', import.meta.url), 'utf8');
  await db.exec(hardening);
  await db.exec(hardening);

  // Defaults: mode off, free limits. photo_cap is NULL after hardening.
  assert.equal((await db.query('SELECT public.entitlements_mode() AS m')).rows[0].m, 'off');
  let e = await plan();
  assert.deepEqual(
    { plan: e.plan, field_cap: e.field_cap, rainfall_slot_cap: e.rainfall_slot_cap, photo_cap: e.photo_cap, history_seasons: e.history_seasons, device_cap: e.device_cap },
    { plan: 'free', field_cap: 50, rainfall_slot_cap: 2, photo_cap: null, history_seasons: 2, device_cap: 1 });

  // Plan states and transitions.
  const sub = (status, end) => asService(`INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end) VALUES ('${farm}', '${status}', ${end})`);
  for (const status of ['active', 'trialing']) {
    await resetFarm(); await sub(status, 'NULL');
    e = await plan(); assert.equal(e.plan, 'paid'); assert.equal(e.field_cap, null);
  }
  for (const status of ['past_due', 'canceled']) {
    await resetFarm(); await sub(status, "now() + interval '5 days'");
    assert.equal((await plan()).plan, 'paid', `${status} before period end`);
    await resetFarm(); await sub(status, "now() - interval '1 day'");
    assert.equal((await plan()).plan, 'free', `${status} after period end`);
  }
  for (const status of ['unpaid', 'incomplete']) {
    await resetFarm(); await sub(status, "now() + interval '5 days'");
    assert.equal((await plan()).plan, 'free', status);
  }
  await resetFarm(); await asService(`UPDATE public.farms SET trial_ends_at = now() + interval '10 days' WHERE id = '${farm}'`);
  assert.equal((await plan()).plan, 'legacy_trial');
  await asService(`UPDATE public.farms SET trial_ends_at = now() - interval '1 day' WHERE id = '${farm}'`);
  assert.equal((await plan()).plan, 'free');
  await resetFarm(); await asService(`INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${farm}', 'comp')`);
  assert.equal((await plan()).plan, 'complimentary');
  await asService(`UPDATE public.farm_comps SET expires_at = now() - interval '1 day' WHERE farm_id = '${farm}'`);
  assert.equal((await plan()).plan, 'free');
  await resetFarm();

  // assert_premium by mode (called as service_role: no uid).
  const assertPremium = (f = farm) => db.exec(`RESET ROLE; SET ROLE service_role; SELECT public.assert_premium('${f}', 'grain'); RESET ROLE`);
  await assertPremium(); // off: no-op
  await setMode('shadow');
  await assertPremium();
  const logged = (await db.query(`SELECT feature, plan FROM public.entitlement_shadow_log WHERE farm_id = '${farm}'`)).rows;
  assert.deepEqual(logged, [{ feature: 'grain', plan: 'free' }]);
  await setMode('enforce');
  await assert.rejects(assertPremium(), (err) => err.code === 'P0402' && /premium_required:grain/.test(err.message));
  await db.exec('RESET ROLE');
  await asService(`INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${farm}', 'comp')`);
  await assertPremium(); // premium passes in enforce
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.entitlement_shadow_log`)).rows[0].n, 1);
  await resetFarm();

  // Privileges and membership.
  await db.exec(`SET ROLE authenticated`);
  assert.deepEqual((await db.query(`SELECT * FROM public.farm_entitlement('${farm}')`)).rows, []); // no uid
  await db.exec(`SELECT set_config('request.uid', '${user}', false)`);
  assert.equal((await db.query(`SELECT * FROM public.farm_entitlement('${farm}')`)).rows[0].plan, 'free');
  // `enforced` mirrors enforce mode only (state is enforce at this point of the test).
  assert.equal((await db.query(`SELECT enforced FROM public.farm_entitlement('${farm}')`)).rows[0].enforced, true);
  await db.exec('RESET ROLE');
  await setMode('shadow');
  await db.exec(`SET ROLE authenticated`);
  assert.equal((await db.query(`SELECT enforced FROM public.farm_entitlement('${farm}')`)).rows[0].enforced, false);
  await db.exec('RESET ROLE');
  await setMode('enforce');
  await db.exec(`SET ROLE authenticated`);
  assert.deepEqual((await db.query(`SELECT * FROM public.farm_entitlement('${other}')`)).rows, []);
  await assert.rejects(db.exec(`SELECT public.assert_premium('${other}', 'grain')`), (err) => err.code === '42501');
  await assert.rejects(db.exec(`SELECT * FROM public._farm_entitlement('${farm}')`), /permission denied/);
  for (const stmt of ['SELECT * FROM public.entitlement_config', 'UPDATE public.entitlement_config SET mode = \'off\'',
    'SELECT * FROM public.entitlement_shadow_log', "INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan) VALUES (gen_random_uuid(), 'x', 'free')"]) {
    await assert.rejects(db.exec(stmt), /permission denied/, stmt);
  }
  await assert.rejects(db.exec(`SELECT public.assert_premium('${farm}', 'grain')`), (err) => err.code === 'P0402');
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(db.exec(`SELECT * FROM public.farm_entitlement('${farm}')`), /permission denied/);
  console.log('Entitlements core migration: replay, plan states, modes, shadow log, membership and privileges passed.');
} finally {
  await db.close();
}
