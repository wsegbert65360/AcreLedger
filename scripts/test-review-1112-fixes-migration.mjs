import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 2026-11-12 review fixes.
//   * guard_field_cap lets a restore replay stored fields on a free farm at or over the cap.
//   * assert_field_capacity writes one shadow row per farm per minute.
//   * get_field_rainfall_daily follows the stored slot when lat/lng are cleared.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const farm = uid(1);
const otherFarm = uid(2);
const user = uid(11);
const slotA = uid(101);
const slotB = uid(102);
const plain = uid(103);
const gone = uid(104);
const otherField = uid(201);
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const svc = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
const mode = (m) => svc(`UPDATE public.entitlement_config SET mode = '${m}'`);
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
const rows = async (sql) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  const r = (await db.query(sql)).rows;
  await db.exec('RESET ROLE');
  return r;
};
const active = async () => (await rows(`SELECT count(*)::int AS n FROM public.fields WHERE farm_id = '${farm}' AND deleted_at IS NULL`))[0].n;
const isCap = (e) => e.code === 'P0402' && /premium_required:field_cap/.test(e.message);
const isRainfallLock = (e) => e.code === 'P0402' && /premium_required:rainfall/.test(e.message);
// The statement _restore_table_for_farm runs, for one field row.
const upsert = (id, name, { farmId = farm, deletedAt = 'NULL' } = {}) => `
  INSERT INTO public.fields (id, farm_id, name, deleted_at) VALUES ('${id}', '${farmId}', '${name}', ${deletedAt})
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, deleted_at = EXCLUDED.deleted_at`;
// What the SECURITY DEFINER restore wrappers do: a transaction-local flag, then the replay.
const restoring = async (sql) => {
  await db.exec('BEGIN');
  try {
    await db.exec(`SELECT set_config('acreledger.restoring', 'on', true); ${sql}`);
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
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
    CREATE TABLE public.fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      name text, lat numeric, lng numeric, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}'), ('${otherFarm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE ON public.fields TO authenticated;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  await db.exec(await mig('20261107020000_field_cap_guard.sql'));
  await db.exec(await mig('20261107040000_rainfall_tiering.sql'));

  // Mode is off: a free farm ends up over the cap (grandfathered). Two oldest fields have coordinates.
  await svc(`
    INSERT INTO public.fields (id, farm_id, name, lat, lng, created_at) VALUES
      ('${slotA}', '${farm}', 'slot-a', 38.5, -93.5, '2020-01-01T00:00:00Z'),
      ('${slotB}', '${farm}', 'slot-b', 38.6, -93.6, '2021-01-01T00:00:00Z'),
      ('${plain}', '${farm}', 'plain', 38.7, -93.7, '2022-01-01T00:00:00Z'),
      ('${gone}', '${farm}', 'gone', NULL, NULL, '2023-01-01T00:00:00Z');
    INSERT INTO public.fields (farm_id, name) SELECT '${farm}', 'old' || g FROM generate_series(1, 51) g;
    INSERT INTO public.fields (id, farm_id, name) VALUES ('${otherField}', '${otherFarm}', 'other-farm')
  `);
  await db.exec(await mig('20261110170000_rainfall_locked_slots.sql'));
  await db.exec(await mig('20261110190000_entitlements_hardening.sql'));
  const fix = await mig('20261113120000_review_1112_field_cap_restore_and_rainfall_slot.sql');
  await db.exec(fix);
  await db.exec(fix); // replay is idempotent
  assert.equal(await active(), 55);

  // Shadow: over-cap inserts are allowed, and a retry loop writes one log row, not one per attempt.
  await mode('shadow');
  await asUser();
  for (const n of [1, 2, 3]) await db.exec(`INSERT INTO public.fields (farm_id, name) VALUES ('${farm}', 'shadow${n}')`);
  await db.exec('RESET ROLE');
  assert.equal(await active(), 58);
  assert.equal((await rows(`SELECT count(*)::int AS n FROM public.entitlement_shadow_log WHERE feature = 'field_cap' AND farm_id = '${farm}'`))[0].n, 1);
  // An older row does not silence a new one.
  await db.exec(`RESET ROLE; UPDATE public.entitlement_shadow_log SET created_at = now() - interval '2 minutes' WHERE feature = 'field_cap'`);
  await asUser();
  await db.exec(`INSERT INTO public.fields (farm_id, name) VALUES ('${farm}', 'shadow4')`);
  await db.exec('RESET ROLE');
  assert.equal((await rows(`SELECT count(*)::int AS n FROM public.entitlement_shadow_log WHERE feature = 'field_cap' AND farm_id = '${farm}'`))[0].n, 2);
  assert.equal(await active(), 59);

  await mode('enforce');
  await asUser();

  // A new field is still refused, with or without the restore flag.
  await assert.rejects(db.exec(`INSERT INTO public.fields (farm_id, name) VALUES ('${farm}', 'blocked')`), isCap);
  await assert.rejects(restoring(upsert(uid(900), 'never-stored')), isCap);
  // The flag does not let a restore pull in another farm's field id.
  await assert.rejects(restoring(upsert(otherField, 'stolen')), isCap);

  // Upsert replay of a field that is already active adds nothing, so it passes even without the flag.
  await db.exec(upsert(plain, 'plain-renamed'));
  await restoring(upsert(slotA, 'slot-a-restored'));
  await db.exec('RESET ROLE');
  assert.equal(await active(), 59);
  assert.equal((await rows(`SELECT name FROM public.fields WHERE id = '${plain}'`))[0].name, 'plain-renamed');
  assert.equal((await rows(`SELECT name FROM public.fields WHERE id = '${slotA}'`))[0].name, 'slot-a-restored');

  // Reactivation at the cap: refused for a client, allowed for a restore of a stored field.
  await asUser();
  await db.exec(`UPDATE public.fields SET deleted_at = now() WHERE id = '${gone}'`);
  await assert.rejects(db.exec(`UPDATE public.fields SET deleted_at = NULL WHERE id = '${gone}'`), isCap);
  await assert.rejects(db.exec(upsert(gone, 'client-upsert')), isCap);
  await restoring(upsert(gone, 'gone-restored'));
  await db.exec('RESET ROLE');
  assert.equal(await active(), 59);
  assert.equal((await rows(`SELECT deleted_at FROM public.fields WHERE id = '${gone}'`))[0].deleted_at, null);

  // A whole over-cap farm replays in one transaction (the undo case).
  const all = await rows(`SELECT id, name FROM public.fields WHERE farm_id = '${farm}'`);
  await asUser();
  await restoring(all.map((f) => upsert(f.id, f.name)).join(';'));
  // The flag is transaction-local: the next statement is guarded again.
  await assert.rejects(db.exec(upsert(uid(901), 'after-restore')), isCap);
  await db.exec('RESET ROLE');
  assert.equal(await active(), 59);

  // Rainfall read follows the stored slot.
  const readDaily = (field) => db.query(`SELECT rain_date FROM public.get_field_rainfall_daily('${field}', '2026-07-01', '2026-07-31')`);
  await asUser();
  assert.deepEqual((await readDaily(slotB)).rows, []);
  await assert.rejects(readDaily(plain), isRainfallLock);
  // Coordinates cleared: the slot stays, so the read is empty, not an upgrade prompt.
  await db.exec(`UPDATE public.fields SET lat = NULL, lng = NULL WHERE id = '${slotB}'`);
  assert.deepEqual((await readDaily(slotB)).rows, []);
  await assert.rejects(readDaily(plain), isRainfallLock);
  // Soft-delete releases the slot to the next oldest field; the deleted field is locked again.
  await db.exec(`UPDATE public.fields SET deleted_at = now() WHERE id = '${slotB}'`);
  await assert.rejects(readDaily(slotB), isRainfallLock);
  assert.deepEqual((await readDaily(plain)).rows, []);
  // Another farm's field returns nothing.
  assert.deepEqual((await readDaily(otherField)).rows, []);

  // Clients still cannot call the helper directly.
  await assert.rejects(db.query(`SELECT public.assert_field_capacity('${farm}')`), /permission denied/);
  await db.exec('RESET ROLE');
  console.log('Review 2026-11-12 fixes: field cap restore replay, shadow dedup, and rainfall slot read passed.');
} finally {
  await db.close();
}
