import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: field cap guard across modes and plans, with grandfathering.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const paidFarm = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
const seed = (f, n, tag) => svc(`INSERT INTO public.fields (farm_id, name) SELECT '${f}', '${tag}' || g FROM generate_series(1, ${n}) g`);
const active = async (f) => (await db.query(`SELECT count(*)::int AS n FROM public.fields WHERE farm_id = '${f}' AND deleted_at IS NULL`)).rows[0].n;
const insert = (f, name) => db.exec(`INSERT INTO public.fields (farm_id, name) VALUES ('${f}', '${name}')`);
const isCap = (e) => e.code === 'P0402' && /premium_required:field_cap/.test(e.message);
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
      name text, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}'), ('${paidFarm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.fields TO authenticated;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  const guard = await mig('20261107020000_field_cap_guard.sql');
  await db.exec(guard); await db.exec(guard); // replay

  // Grandfather: a free farm already over the cap (55 fields) before enforcement.
  await seed(farm, 55, 'old'); await seed(paidFarm, 60, 'paid');

  // Mode off: no-op, inserts allowed even past the cap.
  await asUser(); await insert(farm, 'off-extra'); await db.exec('RESET ROLE');
  assert.equal(await active(farm), 56);

  // Shadow: allowed, logged.
  await mode('shadow');
  await asUser(); await insert(farm, 'shadow-extra'); await db.exec('RESET ROLE');
  assert.equal(await active(farm), 57);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.entitlement_shadow_log WHERE feature = 'field_cap' AND farm_id = '${farm}'`)).rows[0].n, 1);

  // Enforce: new field refused at/over cap; paid farm unaffected.
  await mode('enforce');
  await asUser();
  await assert.rejects(insert(farm, 'blocked'), isCap);
  assert.equal(await active(farm), 57);
  // Existing over-cap fields stay editable (grandfathered).
  await db.exec(`UPDATE public.fields SET name = 'renamed' WHERE farm_id = '${farm}' AND name = 'old1'`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.fields WHERE name = 'renamed'`)).rows[0].n, 1);
  // Soft-delete down to 49 active, then exactly one more is allowed (cap = 50).
  await db.exec(`UPDATE public.fields SET deleted_at = now() WHERE id IN (SELECT id FROM public.fields WHERE farm_id = '${farm}' AND deleted_at IS NULL LIMIT 8)`);
  assert.equal(await active(farm), 49);
  await insert(farm, 'fits');
  assert.equal(await active(farm), 50);
  await assert.rejects(insert(farm, 'blocked-again'), isCap);
  // Reactivating a soft-deleted field at the cap is refused too.
  await assert.rejects(db.exec(`UPDATE public.fields SET deleted_at = NULL WHERE id = (SELECT id FROM public.fields WHERE farm_id = '${farm}' AND deleted_at IS NOT NULL LIMIT 1)`), isCap);
  // Soft-deleting never trips the guard.
  await db.exec(`UPDATE public.fields SET deleted_at = now() WHERE id = (SELECT id FROM public.fields WHERE farm_id = '${farm}' AND deleted_at IS NULL LIMIT 1)`);
  await db.exec('RESET ROLE');

  // Paid farm: unlimited, and a lapsed subscription returns it to the cap.
  await svc(`INSERT INTO public.fields (farm_id, name) VALUES ('${paidFarm}', 'paid-extra')`);
  assert.equal(await active(paidFarm), 61);
  await svc(`UPDATE public.farm_subscriptions SET status = 'canceled', current_period_end = now() - interval '1 day' WHERE farm_id = '${paidFarm}'`);
  await assert.rejects(svc(`INSERT INTO public.fields (farm_id, name) VALUES ('${paidFarm}', 'lapsed')`), isCap);
  assert.equal(await active(paidFarm), 61); // nothing deleted on downgrade

  // Clients cannot call the helper directly.
  await asUser();
  await assert.rejects(db.query(`SELECT public.assert_field_capacity('${farm}')`), /permission denied/);
  console.log('Field cap guard: replay, modes, grandfathering, reactivation, paid/lapsed and privileges passed.');
} finally {
  await db.close();
}
