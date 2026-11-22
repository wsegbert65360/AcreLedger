import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261121130000_subscription_livemode_and_active_bound.sql.
// An `active` row is Pro only through current_period_end + 14 days; the
// other branches are unchanged; clients cannot write livemode.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const planFor = async () => (await db.query(`SELECT plan, premium_until FROM public._farm_entitlement('${farm}')`)).rows[0].plan;
const setSub = async (status, periodEnd, pastDueSince = 'NULL') => {
  await db.exec(`UPDATE public.farm_subscriptions SET deleted_at = now() WHERE deleted_at IS NULL`);
  await db.exec(`INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end, past_due_since)
    VALUES ('${farm}', '${status}', ${periodEnd}, ${pastDueSince})`);
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    INSERT INTO public.farms VALUES ('${farm}');
    CREATE TABLE public.farm_comps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, expires_at timestamptz, deleted_at timestamptz);
    CREATE TABLE public.farm_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, status text NOT NULL,
      current_period_end timestamptz, past_due_since timestamptz, deleted_at timestamptz);
    GRANT USAGE ON SCHEMA public TO authenticated;
    -- As in production (20260917043144): clients may read, never write.
    GRANT SELECT ON public.farm_subscriptions TO authenticated;
    CREATE FUNCTION public.entitlement_free_limits()
      RETURNS TABLE (field_cap int, rainfall_slot_cap int, photo_cap int, history_seasons int, device_cap int)
      LANGUAGE sql AS $$ SELECT 50, 2, NULL::int, 2, 1 $$;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261121130000_subscription_livemode_and_active_bound.sql', import.meta.url), 'utf8'));

  await setSub('active', `now() + interval '200 days'`);
  assert.equal(await planFor(), 'paid', 'active in period');
  await setSub('active', `now() - interval '10 days'`);
  assert.equal(await planFor(), 'paid', 'active within 14 days after period end (late renewal event)');
  await setSub('active', `now() - interval '15 days'`);
  assert.equal(await planFor(), 'free', 'active long past period end (webhooks stopped) is not Pro');
  await setSub('active', 'NULL');
  assert.equal(await planFor(), 'paid', 'active with no period end keeps the previous behaviour');

  // Unchanged branches.
  await setSub('trialing', `now() + interval '1 year'`);
  assert.equal(await planFor(), 'free', 'trialing');
  await setSub('past_due', `now() + interval '1 year'`, `now() - interval '3 days'`);
  assert.equal(await planFor(), 'paid', 'past_due within grace');
  await setSub('past_due', `now() + interval '1 year'`, `now() - interval '20 days'`);
  assert.equal(await planFor(), 'free', 'past_due after grace');
  await setSub('canceled', `now() + interval '30 days'`);
  assert.equal(await planFor(), 'paid', 'canceled keeps the paid period');

  // livemode exists and clients cannot write it.
  const col = await db.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'farm_subscriptions' AND column_name = 'livemode'`);
  assert.equal(col.rows[0]?.data_type, 'boolean');
  await db.exec(`SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
  await assert.rejects(db.query(`UPDATE public.farm_subscriptions SET livemode = true`), /permission denied/);
  await db.exec('RESET ROLE');

  console.log('subscription livemode + active bound migration: all checks passed');
} finally {
  await db.close();
}
