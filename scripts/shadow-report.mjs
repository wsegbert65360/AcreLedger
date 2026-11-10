// Offline shadow run (Phase 7): disposable PGlite, no network, no Supabase.
// Builds one farm per plan state, performs the same paid-only writes on each in `shadow` mode, and
// reports what WOULD be blocked once `enforce` is on. Fails if the result drifts from the target table.
// Usage: node scripts/shadow-report.mjs [--write]   (--write refreshes docs/free-tier-shadow-report.md)
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const as = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);

// farm label, id, user id, how the farm gets its plan
const FARMS = [
  { label: 'Egbert Farm (complimentary)', farm: uid(1), user: uid(11), plan: 'complimentary' },
  { label: 'Test farm 1 (old trial date)', farm: uid(2), user: uid(12), plan: 'free', stale: true },
  { label: 'Test farm 2 (old trial date)', farm: uid(3), user: uid(13), plan: 'free', stale: true },
  { label: 'Test farm 3 (old trial date)', farm: uid(4), user: uid(14), plan: 'free', stale: true },
  { label: 'New free farm', farm: uid(5), user: uid(15), plan: 'free' },
  { label: 'Paid farm (active subscription)', farm: uid(6), user: uid(16), plan: 'paid' },
];

// What a farm might do in a season. `feature` is what the server calls the gate (null = always free).
const OPS = [
  ['Harvest to town', null, (f) => `INSERT INTO public.harvest_records (farm_id, destination, bushels) VALUES ('${f}', 'town', 5000)`],
  ['Plain field (no FSA, landlord or CLU data)', null, (f) => `INSERT INTO public.fields (farm_id, name, producer_share, clu_numbers) VALUES ('${f}', 'plain', 100, '[]')`],
  ['Harvest into a bin', 'grain', (f) => `INSERT INTO public.harvest_records (farm_id, destination, bin_id) VALUES ('${f}', 'bin', '${uid(900)}')`],
  ['Add a grain bin', 'grain', (f) => `INSERT INTO public.bins (farm_id, name) VALUES ('${f}', 'Bin 1')`],
  ['Log a grain movement', 'grain', (f) => `INSERT INTO public.grain_movements (farm_id, bushels) VALUES ('${f}', 100)`],
  ['Add equipment', 'equipment', (f) => `INSERT INTO public.equipment (farm_id, name) VALUES ('${f}', 'Tractor')`],
  ['Log maintenance', 'equipment', (f) => `INSERT INTO public.maintenance_logs (farm_id, note) VALUES ('${f}', 'oil')`],
  ['Add a maintenance schedule', 'equipment', (f) => `INSERT INTO public.maintenance_schedules (farm_id, note) VALUES ('${f}', 'oil')`],
  ['Assign a CLU', 'fsa_tract', (f) => `INSERT INTO public.field_clu_assignments (farm_id, clu) VALUES ('${f}', '1')`],
  ['Import FSA tract', 'fsa_tract', (f) => `INSERT INTO public.fsa_tract_imports (farm_id, tract) VALUES ('${f}', '9')`],
  ['Field with FSA tract number', 'fsa_tract', (f) => `INSERT INTO public.fields (farm_id, name, fsa_tract_number) VALUES ('${f}', 'fsa', '77')`],
  ['Field with landlord split', 'landlord_split', (f) => `INSERT INTO public.fields (farm_id, name, landlord_name, producer_share) VALUES ('${f}', 'rented', 'Smith', 60)`],
  ['Restore a backup', 'backup_restore', () => `SELECT public.restore_farm_backup('{}'::jsonb)`],
];

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
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  `);
  for (const f of FARMS) {
    await db.exec(`INSERT INTO public.farms (id, trial_ends_at) VALUES ('${f.farm}', ${f.stale ? "now() + interval '60 days'" : 'NULL'});
      INSERT INTO public.profiles VALUES ('${f.user}', '${f.farm}');`);
    if (f.plan === 'complimentary') await db.exec(`INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${f.farm}', 'owner farm')`);
    if (f.plan === 'paid') await db.exec(`INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${f.farm}', 'active')`);
  }
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  await db.exec(await mig('20261107050000_paid_feature_guards.sql'));
  await db.exec(await mig('20261109210000_remove_trial.sql'));
  await svc(`UPDATE public.entitlement_config SET mode = 'shadow'`);

  // The plan the server itself reports for each farm.
  const plans = {};
  for (const f of FARMS) {
    await as(f.user);
    plans[f.farm] = (await db.query(`SELECT plan FROM public.farm_entitlement('${f.farm}')`)).rows[0].plan; // as the farm's own member, like the app
  }
  await db.exec('RESET ROLE');
  for (const f of FARMS) assert.equal(plans[f.farm], f.plan, `${f.label}: server reports ${plans[f.farm]}, expected ${f.plan}`);

  // Run every operation as each farm's user. Shadow mode must never fail a write.
  for (const f of FARMS) {
    for (const [name, , sql] of OPS) {
      await as(f.user);
      await db.query(sql(f.farm)).catch((e) => assert.fail(`shadow mode rejected "${name}" for ${f.label}: ${e.message}`));
    }
    await db.exec('RESET ROLE');
  }

  // What would be blocked, per farm.
  await db.exec('RESET ROLE; SET ROLE service_role');
  const logged = (await db.query(`SELECT farm_id, feature, count(*)::int AS n FROM public.entitlement_shadow_log GROUP BY 1, 2`)).rows;
  await db.exec('RESET ROLE');
  const wouldBlock = (farm, feature) => logged.some((r) => r.farm_id === farm && r.feature === feature);

  const lines = [];
  const header = `| Operation | gate | ${FARMS.map((f) => f.label).join(' | ')} |`;
  lines.push(header, `|${' --- |'.repeat(FARMS.length + 2)}`);
  for (const [name, feature] of OPS) {
    const cells = FARMS.map((f) => {
      const blocked = feature ? wouldBlock(f.farm, feature) : false;
      // Target table: only a free farm is ever blocked, and only on gated features.
      assert.equal(blocked, f.plan === 'free' && feature !== null, `${f.label} / ${name}: would-block=${blocked}`);
      return blocked ? 'BLOCKED' : 'ok';
    });
    lines.push(`| ${name} | ${feature ?? 'free'} | ${cells.join(' | ')} |`);
  }
  const report = [
    '# Free tier shadow report (offline simulation)',
    '',
    'Generated by `node scripts/shadow-report.mjs --write` on a disposable Postgres (PGlite) with the real migrations',
    '`20261107000000_entitlements_core.sql` `20261107050000_paid_feature_guards.sql` and `20261109210000_remove_trial.sql`, in `shadow` mode. A leftover trial date no longer grants access.',
    'BLOCKED = this write would be refused once `ENTITLEMENTS_MODE = enforce`. In shadow mode every write still succeeds.',
    '',
    ...lines,
    '',
    'Not covered here (own tests in `npm run test:db-integrity`): field cap, photo cap, rainfall tiering.',
    'Reports and the harvest bin picker are display-only gates in the app, so they have no server log row.',
    'This is a simulation, not a run against real farm data; a staging Supabase branch with real copies is still to do.',
    '',
  ].join('\n');
  console.log(report);
  if (process.argv.includes('--write')) {
    await writeFile(new URL('../docs/free-tier-shadow-report.md', import.meta.url), report);
    console.log('Wrote docs/free-tier-shadow-report.md');
  }
  console.log('Shadow report matches the target table: only free farms are blocked, only on gated features.');
} finally {
  await db.close();
}
