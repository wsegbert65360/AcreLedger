import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const farm = '33333333-3333-4333-8333-333333333333';
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('email', current_setting('request.email', true)) $$;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE);
    CREATE TABLE public.fields (id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE, deleted_at timestamptz, UNIQUE (farm_id, id));
    INSERT INTO auth.users VALUES ('${user}', 'farmer@example.com'), ('${other}', 'other@example.com');
    INSERT INTO public.farms VALUES ('${farm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql', import.meta.url), 'utf8'));
  await db.exec(`
    SELECT set_config('acreledger.cattle_rpc', 'on', true);
    INSERT INTO public.cattle_groups (id, farm_id, name, class, head_count)
      VALUES ('44444444-4444-4444-8444-444444444444', '${farm}', 'Deletion Test', 'cows', 3);
    INSERT INTO public.cattle_moves (id, farm_id, group_id, moved_on, head_count)
      VALUES ('55555555-5555-4555-8555-555555555555', '${farm}', '44444444-4444-4444-8444-444444444444', '2026-01-01', 3);
    INSERT INTO public.cattle_events (id, farm_id, group_id, event_type, event_date, head_delta)
      VALUES ('66666666-6666-4666-8666-666666666666', '${farm}', '44444444-4444-4444-8444-444444444444', 'working', '2026-01-01', 0);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260910230451_account_deletion_requests.sql', import.meta.url), 'utf8'));
  await db.exec(`INSERT INTO public.account_deletion_requests (user_id, farm_id) VALUES ('${user}', '${farm}')`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261013040147_preserve_account_deletion_audit.sql', import.meta.url), 'utf8'));
  let { rows } = await db.query('SELECT * FROM public.account_deletion_requests');
  const id = rows[0].id;
  assert.equal(rows[0].requested_by, user);
  assert.equal(rows[0].requested_email, 'farmer@example.com');

  // Client reads remain owner-only, with no new update/cancellation rights.
  await db.exec(`GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON public.profiles TO authenticated;
    SELECT set_config('request.uid', '${user}', false);
    SELECT set_config('request.email', 'farmer@example.com', false);
    SET ROLE authenticated;`);
  assert.equal((await db.query('SELECT * FROM public.account_deletion_requests')).rows.length, 1);
  await assert.rejects(db.exec("UPDATE public.account_deletion_requests SET status = 'cancelled'"), /permission denied/);
  await db.exec(`SELECT set_config('request.uid', '${other}', false)`);
  assert.equal((await db.query('SELECT * FROM public.account_deletion_requests')).rows.length, 0);
  await db.exec('RESET ROLE');

  // New client requests cannot forge snapshot identity/email.
  await db.exec(`DELETE FROM public.account_deletion_requests;
    SELECT set_config('request.uid', '${user}', false);
    SELECT set_config('request.email', 'farmer@example.com', false);
    SET ROLE authenticated;
    INSERT INTO public.account_deletion_requests (user_id, farm_id, requested_by, requested_email)
      VALUES ('${user}', '${farm}', '${other}', 'spoof@example.com');
    RESET ROLE;`);
  rows = (await db.query('SELECT * FROM public.account_deletion_requests')).rows;
  const requestId = rows[0].id;
  assert.equal(rows[0].requested_by, user);
  assert.equal(rows[0].requested_email, 'farmer@example.com');
  await db.exec(`DELETE FROM public.farms WHERE id = '${farm}'; DELETE FROM auth.users WHERE id = '${user}'`);
  assert.deepEqual((await db.query(`
    SELECT
      (SELECT count(*)::int FROM public.cattle_groups) AS groups,
      (SELECT count(*)::int FROM public.cattle_moves) AS moves,
      (SELECT count(*)::int FROM public.cattle_events) AS events
  `)).rows[0], { groups: 0, moves: 0, events: 0 });
  rows = (await db.query('SELECT * FROM public.account_deletion_requests')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].farm_id, null);
  assert.equal(rows[0].requested_by, user);
  assert.equal(rows[0].requested_email, 'farmer@example.com');
  assert.equal(rows[0].status, 'pending');
  assert.notEqual(requestId, id);
  await db.query("UPDATE public.account_deletion_requests SET status = 'completed', completed_at = now() WHERE id = $1", [requestId]);
  assert.equal((await db.query('SELECT status FROM public.account_deletion_requests')).rows[0].status, 'completed');
  console.log('Account deletion migration: snapshots, RLS, deletion survival and completion passed (disposable PGlite only).');
} finally { await db.close(); }
