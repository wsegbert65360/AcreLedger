import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable database only: exercise the real SQL with hostile table grants too.
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.farms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users, farm_id uuid REFERENCES public.farms, active_season int);
    CREATE TABLE public.farm_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid REFERENCES public.farms ON DELETE CASCADE);
    INSERT INTO auth.users VALUES ('${user}'), ('${other}');
    INSERT INTO public.profiles (id) VALUES ('${user}'), ('${other}');
    GRANT SELECT, INSERT, UPDATE ON public.farms TO authenticated, anon, service_role;
    INSERT INTO public.farms (name) VALUES ('Legacy');
  `);
  const sql = await readFile(new URL('../supabase/migrations/20261021194611_farm_trial_columns.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // Replay must be idempotent.
  checks++;
  check((await db.query("SELECT trial_started_at, trial_ends_at FROM public.farms WHERE name = 'Legacy'")).rows[0], { trial_started_at: null, trial_ends_at: null });
  await assert.rejects(db.query('SELECT public.ensure_user_farm()'), /Authentication required/); checks++;
  await db.exec(`SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
  const farm = (await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id;
  const first = (await db.query(`SELECT *, trial_ends_at = trial_started_at + interval '3 months' AS calendar_months FROM public.farms WHERE id = '${farm}'`)).rows[0];
  check(first.calendar_months, true);
  await db.exec('RESET ROLE');
  check((await db.query(`SELECT active_season = extract(year FROM now())::int AS initialized FROM public.profiles WHERE id = '${user}'`)).rows[0].initialized, true);
  await db.exec('SET ROLE authenticated');
  check((await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id, farm);
  await db.exec(`SELECT set_config('app.ensure_user_farm', 'true', false);
    UPDATE public.farms SET trial_started_at = '2000-01-01', trial_ends_at = '2099-01-01', name = 'Renamed' WHERE id = '${farm}'`);
  const protectedFarm = (await db.query(`SELECT * FROM public.farms WHERE id = '${farm}'`)).rows[0];
  check(protectedFarm.trial_started_at, first.trial_started_at);
  check(protectedFarm.trial_ends_at, first.trial_ends_at);
  check(protectedFarm.name, 'Renamed');
  await assert.rejects(db.query('SELECT * FROM public.trial_claims'), /permission denied/); checks++;
  await assert.rejects(db.exec(`INSERT INTO public.trial_claims (user_id, farm_id) VALUES ('${other}', '${farm}')`), /permission denied/); checks++;
  await db.exec(`INSERT INTO public.farms (name, trial_started_at, trial_ends_at) VALUES ('Forged', now(), now())`);
  check((await db.query("SELECT trial_started_at, trial_ends_at FROM public.farms WHERE name = 'Forged'")).rows[0], { trial_started_at: null, trial_ends_at: null });
  await db.exec(`RESET ROLE; UPDATE public.profiles SET farm_id = NULL WHERE id = '${user}'; SET ROLE authenticated`);
  const second = (await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id;
  assert.notEqual(second, farm); checks++;
  check((await db.query(`SELECT trial_started_at, trial_ends_at FROM public.farms WHERE id = '${second}'`)).rows[0], { trial_started_at: null, trial_ends_at: null });
  await db.exec(`RESET ROLE; UPDATE public.profiles SET farm_id = '${second}' WHERE id = '${other}'; SELECT set_config('request.uid', '${other}', false); SET ROLE authenticated`);
  check((await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id, second);
  check((await db.query(`SELECT trial_started_at FROM public.farms WHERE id = '${second}'`)).rows[0].trial_started_at, null);
  await db.exec(`RESET ROLE`);
  check((await db.query('SELECT count(*)::int AS n FROM public.trial_claims')).rows[0].n, 1);
  await assert.rejects(db.exec(`DELETE FROM public.farms WHERE id = '${farm}'`), /foreign key/); checks++;
  await db.exec(`INSERT INTO public.farm_subscriptions (farm_id) VALUES ('${second}'); UPDATE public.profiles SET farm_id = NULL`);
  await assert.rejects(db.exec(`DELETE FROM public.farms WHERE id = '${second}'`), /foreign key/); checks++;
  check((await db.query('SELECT count(*)::int AS n FROM public.farm_subscriptions')).rows[0].n, 1);
  await db.exec(`SET ROLE anon; INSERT INTO public.farms (name, trial_started_at) VALUES ('Anon', now()); RESET ROLE`);
  check((await db.query("SELECT trial_started_at FROM public.farms WHERE name = 'Anon'")).rows[0].trial_started_at, null);
  await db.exec(`SET ROLE service_role; UPDATE public.farms SET trial_ends_at = '2099-01-01' WHERE id = '${farm}'; RESET ROLE`);
  check((await db.query(`SELECT trial_ends_at = '2099-01-01'::timestamptz AS allowed FROM public.farms WHERE id = '${farm}'`)).rows[0].allowed, true);
  check((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'trial_claims'")).rows[0].n, 0);
  // The paired rollback restores the previous RPC and cascade FK as executable SQL.
  const down = sql.split('/* ROLLBACK')[1].split('\n').slice(1).join('\n').split('*/')[0];
  await db.exec(down);
  check((await db.query("SELECT confdeltype FROM pg_constraint WHERE conrelid = 'public.farm_subscriptions'::regclass AND contype = 'f'")).rows[0].confdeltype, 'c');
  check((await db.query("SELECT to_regclass('public.trial_claims') AS t")).rows[0].t, null);
  await db.exec('SET ROLE authenticated');
  check(typeof (await db.query('SELECT public.ensure_user_farm() AS id')).rows[0].id, 'string');
  console.log(`Farm trial migration: ${checks} checks passed (disposable PGlite only).`);
} finally { await db.close(); }
