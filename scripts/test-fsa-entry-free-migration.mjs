import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261116120000_fsa_entry_free.sql removes only the fsa_tract write guards.
// Free farms can import tracts, assign CLUs and save FSA numbers on a field; every other
// guard (grain, harvest bin link, equipment, landlord split, backup restore) still enforces.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freeFarm = uid(1);
const paidFarm = uid(2);
const freeUser = uid(3);
const paidUser = uid(4);
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const as = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const blocked = (feature) => (e) => e.code === 'P0402' && e.message.includes(`premium_required:${feature}`);

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
  await db.exec(await mig('20261107050000_paid_feature_guards.sql'));
  const freeFsa = await mig('20261116120000_fsa_entry_free.sql');
  await db.exec(freeFsa); await db.exec(freeFsa); // replay is safe

  const triggers = (await db.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`)).rows.map((r) => r.tgname);
  assert.ok(!triggers.includes('guard_premium_fsa_tract_imports'));
  assert.ok(!triggers.includes('guard_premium_field_clu_assignments'));
  for (const kept of ['guard_premium_bins', 'guard_premium_grain_movements', 'guard_premium_equipment',
    'guard_premium_maintenance_logs', 'guard_premium_maintenance_schedules', 'guard_premium_harvest_bin',
    'guard_premium_field_columns']) {
    assert.ok(triggers.includes(kept), `${kept} must remain`);
  }

  await svc(`UPDATE public.entitlement_config SET mode = 'enforce'`);
  await as(freeUser);

  // Free farm: FSA tract import, CLU assignment, and FSA numbers on a field all succeed.
  await db.query(`INSERT INTO public.fsa_tract_imports (id, farm_id, tract) VALUES ('${uid(10)}', '${freeFarm}', '6418-1417')`);
  await db.query(`UPDATE public.fsa_tract_imports SET tract = '6418-1418' WHERE id = '${uid(10)}'`);
  await db.query(`INSERT INTO public.field_clu_assignments (id, farm_id, clu) VALUES ('${uid(11)}', '${freeFarm}', '3')`);
  await db.query(`UPDATE public.field_clu_assignments SET clu = '4' WHERE id = '${uid(11)}'`);
  await db.query(`INSERT INTO public.fields (id, farm_id, name, fsa_farm_number, fsa_tract_number, fsa_field_number, clu_numbers, producer_share)
    VALUES ('${uid(12)}', '${freeFarm}', 'North', '6418', '1417', '3', '["3","4"]', 100)`);
  await db.query(`UPDATE public.fields SET fsa_tract_number = '1418', clu_numbers = '["5"]' WHERE id = '${uid(12)}'`);
  // Offline replay sends the same upsert again; still accepted.
  await db.query(`INSERT INTO public.fields (id, farm_id, name, fsa_tract_number) VALUES ('${uid(12)}', '${freeFarm}', 'North', '1419')
    ON CONFLICT (id) DO UPDATE SET fsa_tract_number = EXCLUDED.fsa_tract_number`);
  await db.query(`INSERT INTO public.field_clu_assignments (id, farm_id, clu) VALUES ('${uid(11)}', '${freeFarm}', '6')
    ON CONFLICT (id) DO UPDATE SET clu = EXCLUDED.clu`);
  // Soft delete still allowed.
  await db.query(`UPDATE public.fsa_tract_imports SET deleted_at = now() WHERE id = '${uid(10)}'`);

  // Every other free-farm guard still enforces.
  await assert.rejects(db.query(`INSERT INTO public.bins (farm_id, name) VALUES ('${freeFarm}', 'x')`), blocked('grain'));
  await assert.rejects(db.query(`INSERT INTO public.grain_movements (farm_id, bushels) VALUES ('${freeFarm}', 1)`), blocked('grain'));
  await assert.rejects(db.query(`INSERT INTO public.equipment (farm_id, name) VALUES ('${freeFarm}', 't')`), blocked('equipment'));
  await assert.rejects(db.query(`INSERT INTO public.maintenance_logs (farm_id, note) VALUES ('${freeFarm}', 'o')`), blocked('equipment'));
  await assert.rejects(db.query(`INSERT INTO public.harvest_records (farm_id, destination, bin_id) VALUES ('${freeFarm}', 'bin', '${uid(900)}')`), blocked('grain'));
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, landlord_name) VALUES ('${freeFarm}', 'd', 'Smith')`), blocked('landlord_split'));
  await assert.rejects(db.query(`INSERT INTO public.fields (farm_id, name, producer_share) VALUES ('${freeFarm}', 'e', 60)`), blocked('landlord_split'));
  await assert.rejects(db.query(`UPDATE public.fields SET producer_share = 50 WHERE id = '${uid(12)}'`), blocked('landlord_split'));
  await assert.rejects(db.query(`SELECT public.restore_farm_backup('{}'::jsonb)`), blocked('backup_restore'));
  await assert.rejects(db.query(`SELECT public.assert_premium('${freeFarm}', 'reports')`), blocked('reports'));

  // Paid farm is unaffected.
  await as(paidUser);
  await db.query(`INSERT INTO public.fields (farm_id, name, fsa_tract_number, landlord_name, producer_share) VALUES ('${paidFarm}', 'p', '5', 'Jones', 70)`);
  await db.query(`SELECT public.assert_premium('${paidFarm}', 'reports')`);
  await db.exec('RESET ROLE');
  console.log('FSA entry free: fsa_tract guards removed, replay safe, other guards intact.');
} finally {
  await db.close();
}
