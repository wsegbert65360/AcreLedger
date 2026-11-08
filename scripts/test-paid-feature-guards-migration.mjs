import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: paid-feature write guards (Phase 5).
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freeFarm = uid(1);
const paidFarm = uid(2);
const freeUser = uid(3);
const paidUser = uid(4);
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
// Service role has no auth.uid(); clear the simulated user too.
const asSvc = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const as = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const blocked = (feature) => (e) => e.code === 'P0402' && e.message.includes(`premium_required:${feature}`);
const shadowCount = async () => {
  await db.exec('RESET ROLE; SET ROLE service_role');
  const n = (await db.query('SELECT count(*)::int AS n FROM public.entitlement_shadow_log')).rows[0].n;
  await db.exec('RESET ROLE');
  return n;
};

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
    CREATE TABLE public.bins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TABLE public.grain_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, bushels numeric, deleted_at timestamptz);
    CREATE TABLE public.equipment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TABLE public.maintenance_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, note text, deleted_at timestamptz);
    CREATE TABLE public.maintenance_schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, note text, deleted_at timestamptz);
    CREATE TABLE public.field_clu_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, clu text, deleted_at timestamptz);
    CREATE TABLE public.fsa_tract_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, tract text, deleted_at timestamptz);
    CREATE TABLE public.harvest_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, destination text NOT NULL,
      bin_id uuid, bushels numeric, deleted_at timestamptz);
    CREATE TABLE public.fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, name text,
      fsa_farm_number text, fsa_tract_number text, fsa_field_number text, clu_numbers jsonb,
      landlord_name text, producer_share numeric, deleted_at timestamptz);
    -- Stand-in for the real restore function (body is covered by its own tests).
    CREATE FUNCTION public.restore_farm_backup(p_payload jsonb, p_active_season integer DEFAULT NULL)
      RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$ SELECT '{"restored":true}'::jsonb $$;
    GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;
    INSERT INTO public.farms VALUES ('${freeFarm}'), ('${paidFarm}');
    INSERT INTO public.profiles VALUES ('${freeUser}', '${freeFarm}'), ('${paidUser}', '${paidFarm}');
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  const guards = await mig('20261107050000_paid_feature_guards.sql');
  await db.exec(guards); await db.exec(guards); // replay is safe

  const tables = [
    ['bins', `(farm_id, name)`, `('F', 'x')`, 'grain'],
    ['grain_movements', `(farm_id, bushels)`, `('F', 100)`, 'grain'],
    ['equipment', `(farm_id, name)`, `('F', 'tractor')`, 'equipment'],
    ['maintenance_logs', `(farm_id, note)`, `('F', 'oil')`, 'equipment'],
    ['maintenance_schedules', `(farm_id, note)`, `('F', 'oil')`, 'equipment'],
    ['field_clu_assignments', `(farm_id, clu)`, `('F', '1')`, 'fsa_tract'],
    ['fsa_tract_imports', `(farm_id, tract)`, `('F', '9')`, 'fsa_tract'],
  ];
  const ins = (t, cols, vals, farm) => db.query(`INSERT INTO public.${t} ${cols} VALUES ${vals.replace("'F'", `'${farm}'`)}`);

  // OFF: nothing is blocked or logged.
  await as(freeUser);
  for (const [t, c, v] of tables) await ins(t, c, v, freeFarm);
  await db.query(`INSERT INTO public.harvest_records (farm_id, destination, bin_id) VALUES ('${freeFarm}', 'bin', '${uid(900)}')`);
  await db.query(`INSERT INTO public.fields (farm_id, name, fsa_tract_number, landlord_name, producer_share) VALUES ('${freeFarm}', 'a', '12', 'Smith', 60)`);
  await db.exec('RESET ROLE');
  assert.equal(await shadowCount(), 0);
  await svc(`DELETE FROM public.fields; DELETE FROM public.harvest_records; ${tables.map(([t]) => `DELETE FROM public.${t}`).join('; ')}`);

  // SHADOW: writes succeed, one log row per guarded write.
  await mode('shadow');
  await as(freeUser);
  await ins('bins', '(farm_id, name)', "('F', 'x')", freeFarm);
  await db.exec('RESET ROLE');
  assert.equal(await shadowCount(), 1);
  await svc(`DELETE FROM public.bins`);

  // ENFORCE
  await mode('enforce');
  await as(freeUser);
  for (const [t, c, v, feature] of tables) {
    await assert.rejects(ins(t, c, v, freeFarm), blocked(feature), `${t} insert should be blocked for free`);
  }
  // Harvest: free is fine, a bin destination is the paid part.
  await db.query(`INSERT INTO public.harvest_records (farm_id, destination, bushels) VALUES ('${freeFarm}', 'elevator', 5000)`);
  await assert.rejects(db.query(`INSERT INTO public.harvest_records (farm_id, destination, bin_id) VALUES ('${freeFarm}', 'bin', '${uid(900)}')`), blocked('grain'));
  // Fields: a normal new field (share 100, no FSA/CLU/landlord) is free.
  await db.query(`INSERT INTO public.fields (farm_id, name, producer_share, clu_numbers, fsa_tract_number, landlord_name) VALUES ('${freeFarm}', 'plain', 100, '[]', '', NULL)`);
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, fsa_tract_number) VALUES ('${freeFarm}', 'b', '77')`), blocked('fsa_tract'));
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, clu_numbers) VALUES ('${freeFarm}', 'c', '["1","2"]')`), blocked('fsa_tract'));
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, landlord_name) VALUES ('${freeFarm}', 'd', 'Smith')`), blocked('landlord_split'));
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, producer_share) VALUES ('${freeFarm}', 'e', 60)`), blocked('landlord_split'));
  // Backup restore wrapper.
  await assert.rejects(db.query(`SELECT public.restore_farm_backup('{}'::jsonb)`), blocked('backup_restore'));
  await assert.rejects(db.query(`SELECT public._restore_farm_backup_impl('{}'::jsonb, NULL)`), /permission denied/);

  // Grandfathering: existing paid-only data on a free farm stays editable only for unrelated changes,
  // can be soft-deleted, and never blocks plain edits of ungated columns.
  await asSvc();
  await db.query(`INSERT INTO public.fields (id, farm_id, name, fsa_tract_number, landlord_name, producer_share) VALUES ('${uid(500)}', '${freeFarm}', 'old', '12', 'Smith', 60)`);
  await db.query(`INSERT INTO public.bins (id, farm_id, name) VALUES ('${uid(501)}', '${freeFarm}', 'old bin')`);
  await db.query(`INSERT INTO public.harvest_records (id, farm_id, destination, bin_id, bushels) VALUES ('${uid(502)}', '${freeFarm}', 'bin', '${uid(501)}', 10)`);
  await as(freeUser);
  await db.query(`UPDATE public.fields SET name = 'renamed' WHERE id = '${uid(500)}'`);            // ungated column
  await db.query(`UPDATE public.fields SET fsa_tract_number = '12', producer_share = 60 WHERE id = '${uid(500)}'`); // unchanged values
  await assert.rejects(db.query(`UPDATE public.fields SET fsa_tract_number = '13' WHERE id = '${uid(500)}'`), blocked('fsa_tract'));
  await assert.rejects(db.query(`UPDATE public.fields SET producer_share = 50 WHERE id = '${uid(500)}'`), blocked('landlord_split'));
  await db.query(`UPDATE public.harvest_records SET bushels = 11 WHERE id = '${uid(502)}'`);        // bin link unchanged
  await assert.rejects(db.query(`UPDATE public.bins SET name = 'edit' WHERE id = '${uid(501)}'`), blocked('grain'));
  await db.query(`UPDATE public.bins SET deleted_at = now() WHERE id = '${uid(501)}'`);             // soft delete is always allowed
  await db.query(`UPDATE public.fields SET deleted_at = now() WHERE id = '${uid(500)}'`);

  // Paid farm and service role are never blocked.
  await as(paidUser);
  for (const [t, c, v] of tables) await ins(t, c, v, paidFarm);
  await db.query(`INSERT INTO public.harvest_records (farm_id, destination, bin_id) VALUES ('${paidFarm}', 'bin', '${uid(900)}')`);
  await db.query(`INSERT INTO public.fields (farm_id, name, fsa_tract_number, landlord_name, producer_share) VALUES ('${paidFarm}', 'p', '5', 'Jones', 70)`);
  assert.equal((await db.query(`SELECT public.restore_farm_backup('{}'::jsonb) AS r`)).rows[0].r.restored, true);
  await asSvc();
  await db.query(`INSERT INTO public.bins (farm_id, name) VALUES ('${freeFarm}', 'service ok')`);

  // Back to off: the free farm is unrestricted again.
  await db.exec('RESET ROLE');
  await mode('off');
  await as(freeUser);
  await db.query(`INSERT INTO public.bins (farm_id, name) VALUES ('${freeFarm}', 'off ok')`);
  assert.equal((await db.query(`SELECT public.restore_farm_backup('{}'::jsonb) AS r`)).rows[0].r.restored, true);
  console.log('Paid feature guards: replay, off/shadow/enforce, grandfathering, soft delete, restore wrapper passed.');
} finally {
  await db.close();
}
