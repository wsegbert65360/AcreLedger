import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: new-farm signup under each entitlements mode.
const db = new PGlite();
const users = ['a', 'b', 'c', 'd'].map((c, i) => `${String(i + 1).repeat(8)}-${String(i + 1).repeat(4)}-4${String(i + 1).repeat(3)}-8${String(i + 1).repeat(3)}-${String(i + 1).repeat(12)}`);
const [offUser, shadowUser, enforceUser, noEmailUser] = users;
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const asUser = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const signup = async (u) => { await asUser(u); const r = (await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id; await db.exec('RESET ROLE'); return r; };
const farmRow = async (id) => (await db.query(`SELECT trial_started_at, trial_ends_at FROM public.farms WHERE id = '${id}'`)).rows[0];
const plan = async (id) => (await db.query(`SELECT plan FROM public._farm_entitlement('${id}')`)).rows[0].plan;
const claims = async () => (await db.query('SELECT count(*)::int AS n FROM public.trial_claims')).rows[0].n;
const mode = (m) => db.exec(`UPDATE public.entitlement_config SET mode = '${m}'`);
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.farms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, deleted_at timestamptz);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE, farm_id uuid REFERENCES public.farms, active_season int);
    CREATE TABLE public.farm_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'incomplete', current_period_end timestamptz, deleted_at timestamptz);
    CREATE TABLE public.farm_comps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      reason text NOT NULL, expires_at timestamptz, deleted_at timestamptz);
    INSERT INTO auth.users VALUES ('${offUser}', 'off@example.com'), ('${shadowUser}', 'shadow@example.com'),
      ('${enforceUser}', 'enforce@example.com'), ('${noEmailUser}', NULL);
    INSERT INTO public.profiles (id) SELECT id FROM auth.users;
    GRANT SELECT, INSERT, UPDATE ON public.farms TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  const trial = await mig('20261021194611_farm_trial_columns.sql');
  const core = await mig('20261107000000_entitlements_core.sql');
  const free = await mig('20261107010000_new_farms_start_free.sql');
  await db.exec(trial); await db.exec(core); await db.exec(free); await db.exec(free); // replay

  // Mode off (default): exactly today's behavior, a 3-month trial plus a claim.
  const offFarm = await signup(offUser);
  const off = (await db.query(`SELECT trial_ends_at = trial_started_at + interval '3 months' AS months, trial_started_at IS NOT NULL AS stamped FROM public.farms WHERE id = '${offFarm}'`)).rows[0];
  assert.deepEqual(off, { months: true, stamped: true });
  assert.equal(await plan(offFarm), 'legacy_trial');
  assert.equal(await claims(), 1);

  // Shadow: new farm starts free, no trial, no claim.
  await mode('shadow');
  const shadowFarm = await signup(shadowUser);
  assert.deepEqual(await farmRow(shadowFarm), { trial_started_at: null, trial_ends_at: null });
  assert.equal(await plan(shadowFarm), 'free');
  assert.equal(await claims(), 1);

  // Enforce: same, and a user with no email can still create a farm (no trial identity needed).
  await mode('enforce');
  const enforceFarm = await signup(enforceUser);
  assert.deepEqual(await farmRow(enforceFarm), { trial_started_at: null, trial_ends_at: null });
  assert.equal(await plan(enforceFarm), 'free');
  const noEmailFarm = await signup(noEmailUser);
  assert.equal(await plan(noEmailFarm), 'free');
  assert.equal(await claims(), 1);

  // Idempotent for an existing farm; active_season still initialized.
  assert.equal(await signup(enforceUser), enforceFarm);
  assert.equal((await db.query(`SELECT active_season = extract(year FROM now())::int AS ok FROM public.profiles WHERE id = '${enforceUser}'`)).rows[0].ok, true);

  // Existing trial farm is untouched by the mode change (still legacy_trial until its date).
  assert.equal(await plan(offFarm), 'legacy_trial');
  // Auth is still required; non-owner execution grants unchanged.
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false)`);
  await assert.rejects(db.query('SELECT public.ensure_user_farm()'), /Authentication required/);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT public.ensure_user_farm()'), /permission denied/);
  console.log('New-farm free start: replay, mode off legacy trial, shadow/enforce free start, no-email signup passed.');
} finally {
  await db.close();
}
