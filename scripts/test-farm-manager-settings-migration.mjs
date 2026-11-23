import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261122200000_farm_manager_only_settings_rpcs.sql.
// Owners and admins can change farm-wide settings; workers get 42501 from
// update_farm_name, set_farm_fsa_operator, set_runs_cattle and the
// pre-season reset start/undo RPCs. Another farm's id is still refused.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const other = '99999999-9999-4999-8999-999999999999';
const ids = { owner: 'a0000000-0000-4000-8000-000000000001', admin: 'a0000000-0000-4000-8000-000000000002', worker: 'a0000000-0000-4000-8000-000000000003' };
const as = (who) => db.exec(`SELECT set_config('request.uid', '${ids[who]}', false)`);
const managerOnly = (e) => e.code === '42501' && /owner or an admin/.test(e.message);

try {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA extensions;
    CREATE TABLE public.farms (id uuid PRIMARY KEY, name text, runs_cattle boolean DEFAULT false,
      fsa_operator_name text, fsa_operator_address text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid, farm_role text, active_season integer);
    CREATE TABLE public.pre_season_reset_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid,
      user_id uuid, from_season integer, to_season integer, payload jsonb, created_at timestamptz DEFAULT now(),
      undone_at timestamptz, deleted_at timestamptz);
    INSERT INTO public.farms (id, name) VALUES ('${farm}', 'Home'), ('${other}', 'Other');
    INSERT INTO public.profiles VALUES
      ('${ids.owner}', '${farm}', 'owner', 2026),
      ('${ids.admin}', '${farm}', 'admin', 2026),
      ('${ids.worker}', '${farm}', 'worker', 2026);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261122200000_farm_manager_only_settings_rpcs.sql', import.meta.url), 'utf8'));

  for (const who of ['owner', 'admin']) {
    await as(who);
    await db.query(`SELECT public.update_farm_name('Renamed by ${who}')`);
    await db.query(`SELECT public.set_farm_fsa_operator('${farm}', 'Op', 'Addr')`);
    await db.query(`SELECT public.set_runs_cattle('${farm}', true)`);
    await assert.rejects(db.query(`SELECT public.set_runs_cattle('${other}', true)`), (e) => e.code === '42501', `${who} cannot touch another farm`);
  }
  const { rows: [f] } = await db.query(`SELECT name, runs_cattle, fsa_operator_name FROM public.farms WHERE id = '${farm}'`);
  assert.deepEqual(f, { name: 'Renamed by admin', runs_cattle: true, fsa_operator_name: 'Op' });

  await as('worker');
  await assert.rejects(db.query(`SELECT public.update_farm_name('Nope')`), managerOnly, 'worker cannot rename');
  await assert.rejects(db.query(`SELECT public.set_farm_fsa_operator('${farm}', 'X', 'Y')`), managerOnly, 'worker cannot set operator');
  await assert.rejects(db.query(`SELECT public.set_runs_cattle('${farm}', false)`), managerOnly, 'worker cannot toggle cattle');
  await assert.rejects(db.query(`SELECT public.start_pre_season_reset(2026, 2027)`), managerOnly, 'worker cannot start a reset');
  await assert.rejects(db.query(`SELECT public.undo_pre_season_reset(gen_random_uuid())`), managerOnly, 'worker cannot undo a reset');

  // Owner passes the role check; undo then fails only because the snapshot is missing.
  await as('owner');
  await assert.rejects(db.query(`SELECT public.undo_pre_season_reset(gen_random_uuid())`), (e) => e.code === 'P0002', 'owner reaches the snapshot lookup');

  const { rows: grants } = await db.query(`SELECT has_function_privilege('authenticated', 'public._require_farm_manager(uuid)', 'EXECUTE') AS auth,
    has_function_privilege('anon', 'public._require_farm_manager(uuid)', 'EXECUTE') AS anon`);
  assert.deepEqual(grants[0], { auth: false, anon: false }, 'helper is not callable by clients');

  console.log('farm manager settings RPCs: all checks passed');
} finally {
  await db.close();
}
