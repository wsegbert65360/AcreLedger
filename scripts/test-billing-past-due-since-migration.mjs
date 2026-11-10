import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable in-process Postgres. Pro after a failed renewal is 14 days from
// past_due_since, not Stripe's advanced current_period_end.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const mig = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const asService = async (sql) => { await db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`); };
const resetFarm = () => asService(`
  UPDATE public.farm_comps SET deleted_at = now() WHERE farm_id = '${farm}';
  UPDATE public.farm_subscriptions SET deleted_at = now() WHERE farm_id = '${farm}'`);
const entitlement = async () => (await db.query(`
  SELECT e.plan,
         e.field_cap,
         (e.premium_until = s.past_due_since + interval '14 days') AS until_grace,
         (e.premium_until = s.current_period_end) AS until_period
  FROM public._farm_entitlement('${farm}') e
  LEFT JOIN public.farm_subscriptions s
    ON s.farm_id = '${farm}' AND s.deleted_at IS NULL
`)).rows[0];

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.farms (id uuid PRIMARY KEY, trial_ends_at timestamptz);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    CREATE TABLE public.farm_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      status text NOT NULL, current_period_end timestamptz, deleted_at timestamptz);
    CREATE TABLE public.farm_comps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES public.farms,
      reason text NOT NULL, expires_at timestamptz, deleted_at timestamptz);
    INSERT INTO public.farms VALUES ('${farm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  const sql = await mig('20261110160000_billing_past_due_since.sql');
  await db.exec(sql);
  await db.exec(sql); // replay must not drop the column or existing values

  const column = (await db.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'farm_subscriptions' AND column_name = 'past_due_since'
  `)).rows[0];
  assert.equal(column?.data_type, 'timestamp with time zone');

  const sub = (status, end, since) => asService(`
    INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end, past_due_since)
    VALUES ('${farm}', '${status}', ${end}, ${since})`);

  // No row: free record book.
  let row = await entitlement();
  assert.equal(row.plan, 'free');
  assert.equal(row.field_cap, 50);

  // active => paid through current_period_end.
  await resetFarm();
  await sub('active', "now() + interval '20 days'", 'NULL');
  row = await entitlement();
  assert.equal(row.plan, 'paid', 'active');
  assert.equal(row.until_period, true, 'active premium_until is current_period_end');
  assert.equal(row.field_cap, null);

  // past_due, failure 3 days ago, period end a year out => paid until since + 14 days.
  await resetFarm();
  await sub('past_due', "now() + interval '1 year'", "now() - interval '3 days'");
  row = await entitlement();
  assert.equal(row.plan, 'paid', 'past_due inside grace');
  assert.equal(row.until_grace, true, 'grace ends at past_due_since + 14 days');
  assert.equal(row.until_period, false, 'advanced current_period_end is not the Pro end');

  // Exactly 14 days later is still paid. now() stays fixed for one transaction, so
  // the stored anchor and the entitlement check share one clock.
  await resetFarm();
  await db.exec(`
    BEGIN;
    INSERT INTO public.farm_subscriptions (farm_id, status, current_period_end, past_due_since)
    VALUES ('${farm}', 'past_due', now() + interval '1 year', now() - interval '14 days');
    DROP TABLE IF EXISTS edge_result;
    CREATE TEMP TABLE edge_result AS
      SELECT plan FROM public._farm_entitlement('${farm}');
    COMMIT;
  `);
  const edge = (await db.query('SELECT plan FROM edge_result')).rows[0];
  assert.equal(edge.plan, 'paid', 'inclusive 14-day edge');
  await resetFarm();
  await sub('unpaid', "now() + interval '1 year'", "now() - interval '14 days' - interval '1 minute'");
  assert.equal((await entitlement()).plan, 'free', 'past the grace');

  // past_due_since 15 days ago => free even if dunning already canceled and the period end is in the future.
  await resetFarm();
  await sub('canceled', "now() + interval '1 year'", "now() - interval '15 days'");
  row = await entitlement();
  assert.equal(row.plan, 'free', 'expired failure grace');
  assert.equal(row.field_cap, 50);

  // Same expired anchor while still past_due.
  await resetFarm();
  await sub('past_due', "now() + interval '1 year'", "now() - interval '15 days'");
  assert.equal((await entitlement()).plan, 'free', 'past_due after grace');

  // Normal cancel, no failed payment, future period end => paid through that period.
  await resetFarm();
  await sub('canceled', "now() + interval '5 days'", 'NULL');
  row = await entitlement();
  assert.equal(row.plan, 'paid', 'normal cancel');
  assert.equal(row.until_period, true, 'normal cancel premium_until is current_period_end');

  // unpaid with no anchor does not inherit the advanced period end.
  await resetFarm();
  await sub('unpaid', "now() + interval '1 year'", 'NULL');
  assert.equal((await entitlement()).plan, 'free', 'unpaid without anchor');

  // trialing is not Pro, even with a future period end.
  await resetFarm();
  await sub('trialing', "now() + interval '1 year'", 'NULL');
  assert.equal((await entitlement()).plan, 'free', 'trialing');

  // Soft-deleted row is not Pro.
  await resetFarm();
  await sub('active', "now() + interval '20 days'", 'NULL');
  await asService(`UPDATE public.farm_subscriptions SET deleted_at = now() WHERE farm_id = '${farm}' AND deleted_at IS NULL`);
  assert.equal((await entitlement()).plan, 'free', 'soft-deleted');

  // Complimentary still wins over an expired failure.
  await resetFarm();
  await sub('canceled', "now() + interval '1 year'", "now() - interval '15 days'");
  await asService(`INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${farm}', 'owner')`);
  assert.equal((await entitlement()).plan, 'complimentary');

  // Replay keeps a stored anchor.
  await resetFarm();
  await sub('past_due', "now() + interval '1 year'", "timestamptz '2026-01-01T00:00:00Z'");
  await db.exec(sql);
  const kept = (await db.query(`
    SELECT past_due_since = timestamptz '2026-01-01T00:00:00Z' AS kept
    FROM public.farm_subscriptions WHERE farm_id = '${farm}' AND deleted_at IS NULL
  `)).rows[0];
  assert.equal(kept.kept, true, 'replay does not clear past_due_since');

  // Clients can read the mirror and cannot write the anchor. service_role can.
  const priv = (await db.query(`
    SELECT
      has_table_privilege('authenticated', 'public.farm_subscriptions', 'SELECT') AS auth_select,
      has_table_privilege('authenticated', 'public.farm_subscriptions', 'UPDATE') AS auth_update,
      has_table_privilege('authenticated', 'public.farm_subscriptions', 'INSERT') AS auth_insert,
      has_table_privilege('anon', 'public.farm_subscriptions', 'UPDATE') AS anon_update,
      has_column_privilege('authenticated', 'public.farm_subscriptions', 'past_due_since', 'UPDATE') AS auth_column_update,
      has_table_privilege('service_role', 'public.farm_subscriptions', 'UPDATE') AS service_update,
      has_function_privilege('authenticated', 'public._farm_entitlement(uuid)', 'EXECUTE') AS auth_exec,
      has_function_privilege('anon', 'public._farm_entitlement(uuid)', 'EXECUTE') AS anon_exec,
      has_function_privilege('service_role', 'public._farm_entitlement(uuid)', 'EXECUTE') AS service_exec
  `)).rows[0];
  assert.equal(priv.auth_select, true);
  assert.equal(priv.auth_update, false);
  assert.equal(priv.auth_insert, false);
  assert.equal(priv.anon_update, false);
  assert.equal(priv.auth_column_update, false);
  assert.equal(priv.service_update, true);
  assert.equal(priv.auth_exec, false);
  assert.equal(priv.anon_exec, false);
  assert.equal(priv.service_exec, true);

  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.exec(`UPDATE public.farm_subscriptions SET past_due_since = now() WHERE farm_id = '${farm}'`),
    /permission denied/,
  );
  await db.exec('RESET ROLE');
  await asService(`UPDATE public.farm_subscriptions SET past_due_since = now() - interval '1 day' WHERE farm_id = '${farm}' AND deleted_at IS NULL`);

  console.log('Billing past_due_since: grace anchor, cancel, trialing, replay, and client write revoke passed.');
} finally {
  await db.close();
}
