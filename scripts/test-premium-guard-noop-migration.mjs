import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261122140056_premium_guard_allows_noop_updates.sql.
// On a free farm in enforce mode, a no-op UPDATE of a Pro table (a replayed,
// non-increasing meter reading) passes; a real change and an insert still
// need Pro; a soft delete stays allowed.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const eq = '33333333-3333-4333-8333-333333333333';
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false)`);
const premium = (e) => e.code === 'P0402';

try {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION public.entitlements_mode() RETURNS text LANGUAGE sql AS $$ SELECT 'enforce' $$;
    CREATE FUNCTION public.assert_premium(p_farm_id uuid, p_feature text) RETURNS void LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'premium_required' USING ERRCODE = 'P0402'; END $$;
    CREATE TABLE public.equipment (
      id uuid PRIMARY KEY, farm_id uuid NOT NULL, name text, current_reading numeric,
      updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    INSERT INTO public.equipment (id, farm_id, name, current_reading) VALUES ('${eq}', '${farm}', 'Tractor', 1200);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261122140056_premium_guard_allows_noop_updates.sql', import.meta.url), 'utf8'));
  await db.exec(`CREATE TRIGGER guard_premium_equipment BEFORE INSERT OR UPDATE ON public.equipment
    FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('equipment')`);

  await asUser();
  // update_equipment_reading's shape: greatest() keeps the reading, updated_at moves.
  const replay = await db.query(`UPDATE public.equipment SET current_reading = greatest(current_reading, 1100), updated_at = now() + interval '1 second' WHERE id = '${eq}'`);
  assert.equal(replay.affectedRows, 1, 'no-op replay of a lower reading is allowed on a free farm');
  await assert.rejects(db.query(`UPDATE public.equipment SET current_reading = 1300 WHERE id = '${eq}'`), premium, 'a real change still needs Pro');
  await assert.rejects(db.query(`UPDATE public.equipment SET name = 'Combine' WHERE id = '${eq}'`), premium, 'a rename still needs Pro');
  await assert.rejects(db.query(`INSERT INTO public.equipment (id, farm_id, name) VALUES (gen_random_uuid(), '${farm}', 'New')`), premium, 'an insert still needs Pro');
  const del = await db.query(`UPDATE public.equipment SET deleted_at = now() WHERE id = '${eq}'`);
  assert.equal(del.affectedRows, 1, 'a soft delete stays allowed');

  console.log('premium guard no-op updates: all checks passed');
} finally {
  await db.close();
}
