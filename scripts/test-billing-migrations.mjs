import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';

const migrationNames = [
  '20260909184850_farm_subscriptions.sql',
  '20260910230441_protect_billing_webhook_state.sql',
  '20260916091500_revoke_farm_subscriptions_client_writes.sql',
  '20261011200211_billing_review_hardening.sql',
];
const migrations = await Promise.all(migrationNames.map(name =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')));

const farmA = '00000000-0000-0000-0000-000000000001';
const farmB = '00000000-0000-0000-0000-000000000002';
const userA = '00000000-0000-0000-0000-000000000003';
const userB = '00000000-0000-0000-0000-000000000004';

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE public.farms (id uuid PRIMARY KEY);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms(id));
  GRANT SELECT ON public.profiles TO authenticated;
  INSERT INTO public.farms VALUES ('${farmA}'), ('${farmB}');
  INSERT INTO public.profiles VALUES ('${userA}', '${farmA}'), ('${userB}', '${farmB}');
`);
for (const migration of migrations) await db.exec(migration);
await db.exec(`
  INSERT INTO public.farm_subscriptions (farm_id, owner_user_id, status)
  VALUES ('${farmA}', '${userA}', 'active'), ('${farmB}', '${userB}', 'active');
  INSERT INTO public.billing_webhook_events (stripe_event_id, type)
  VALUES ('evt_test', 'customer.subscription.updated');
  SELECT set_config('request.jwt.claim.sub', '${userA}', false);
  SET ROLE authenticated;
`);

const visible = await db.query('SELECT farm_id FROM public.farm_subscriptions ORDER BY farm_id');
assert.deepEqual(visible.rows.map(row => row.farm_id), [farmA]);
await assert.rejects(
  db.query(`UPDATE public.farm_subscriptions SET status = 'canceled' WHERE farm_id = '${farmA}'`),
  { code: '42501' },
);
await assert.rejects(db.query('SELECT * FROM public.billing_webhook_events'), { code: '42501' });
await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon`);
await assert.rejects(db.query('SELECT * FROM public.farm_subscriptions'), { code: '42501' });

await db.close();
console.log('Billing migration checks passed: farm isolation, client write denial, ledger denial, and anonymous denial.');
