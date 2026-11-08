import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: photo cap guard (base64 attachment tokens in spray_records.notes).
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const paidFarm = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const PHOTO = '[ATTACHMENT:data:image/png;base64,AAAA]';
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
const seed = (f, n) => svc(`INSERT INTO public.spray_records (farm_id, notes) SELECT '${f}', 'old ' || g || ' ${PHOTO}' FROM generate_series(1, ${n}) g`);
const photos = async (f) => (await db.query(`SELECT count(*)::int AS n FROM public.spray_records WHERE farm_id = '${f}' AND deleted_at IS NULL AND notes LIKE '%[ATTACHMENT:data:image/%'`)).rows[0].n;
const add = (f, notes) => db.exec(`INSERT INTO public.spray_records (farm_id, notes) VALUES ('${f}', '${notes}')`);
const isCap = (e) => e.code === 'P0402' && /premium_required:photo_cap/.test(e.message);
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
    CREATE TABLE public.spray_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      notes text, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}'), ('${paidFarm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.spray_records TO authenticated;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  const guard = await mig('20261107030000_photo_cap_guard.sql');
  await db.exec(guard); await db.exec(guard); // replay

  // Grandfather: free farm already holds 25 photos (cap is 20); paid farm holds 30.
  await seed(farm, 25); await seed(paidFarm, 30);

  // Off: no-op.
  await asUser(); await add(farm, `off ${PHOTO}`); await db.exec('RESET ROLE');
  assert.equal(await photos(farm), 26);

  // Shadow: allowed + logged.
  await mode('shadow');
  await asUser(); await add(farm, `shadow ${PHOTO}`); await db.exec('RESET ROLE');
  assert.equal(await photos(farm), 27);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.entitlement_shadow_log WHERE feature = 'photo_cap'`)).rows[0].n, 1);

  // Enforce.
  await mode('enforce');
  await asUser();
  await assert.rejects(add(farm, `blocked ${PHOTO}`), isCap);
  await add(farm, 'no photo is always fine');
  // Adding a photo to an existing photo-less record is refused.
  const plain = (await db.query(`SELECT id FROM public.spray_records WHERE notes = 'no photo is always fine'`)).rows[0].id;
  await assert.rejects(db.exec(`UPDATE public.spray_records SET notes = 'now ${PHOTO}' WHERE id = '${plain}'`), isCap);
  // Grandfathered: editing / upserting a record that already has a photo works.
  const old = (await db.query(`SELECT id FROM public.spray_records WHERE notes LIKE 'old 1 %'`)).rows[0].id;
  await db.exec(`UPDATE public.spray_records SET notes = 'edited ${PHOTO}' WHERE id = '${old}'`);
  await db.exec(`INSERT INTO public.spray_records (id, farm_id, notes) VALUES ('${old}', '${farm}', 'upsert ${PHOTO}')
    ON CONFLICT (id) DO UPDATE SET notes = EXCLUDED.notes`);
  assert.equal((await db.query(`SELECT notes FROM public.spray_records WHERE id = '${old}'`)).rows[0].notes, `upsert ${PHOTO}`);
  // Removing photos (soft delete) frees capacity once under the cap.
  await db.exec(`UPDATE public.spray_records SET deleted_at = now() WHERE id IN (SELECT id FROM public.spray_records WHERE farm_id = '${farm}' AND deleted_at IS NULL AND notes LIKE '%[ATTACHMENT:data:image/%' LIMIT 8)`);
  assert.equal(await photos(farm), 19);
  await add(farm, `fits ${PHOTO}`);
  assert.equal(await photos(farm), 20);
  await assert.rejects(add(farm, `blocked-again ${PHOTO}`), isCap);
  await db.exec('RESET ROLE');

  // Paid: unlimited. Lapsed: capped again, nothing removed.
  await svc(`INSERT INTO public.spray_records (farm_id, notes) VALUES ('${paidFarm}', 'paid ${PHOTO}')`);
  assert.equal(await photos(paidFarm), 31);
  await svc(`UPDATE public.farm_subscriptions SET status = 'canceled', current_period_end = now() - interval '1 day' WHERE farm_id = '${paidFarm}'`);
  await assert.rejects(svc(`INSERT INTO public.spray_records (farm_id, notes) VALUES ('${paidFarm}', 'lapsed ${PHOTO}')`), isCap);
  assert.equal(await photos(paidFarm), 31);
  console.log('Photo cap guard: replay, modes, grandfathering, upsert, add-to-existing, paid/lapsed passed.');
} finally {
  await db.close();
}
