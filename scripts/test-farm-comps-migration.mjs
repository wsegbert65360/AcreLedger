import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable, in-process PostgreSQL only. No network or project credentials.
const db = new PGlite();
const farm = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    INSERT INTO public.farms VALUES ('${farm}');
    INSERT INTO public.profiles VALUES ('${user}', '${farm}');
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
  `);
  const sql = await readFile(new URL('../supabase/migrations/20261101120000_farm_comps.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query("SELECT has_table_privilege('service_role', 'public.farm_comps', 'DELETE') AS allowed")).rows[0].allowed, false);
  const status = async () => (await db.query(`SELECT * FROM public.get_farm_comp_status('${farm}')`)).rows;
  await db.exec(`SET ROLE authenticated`);
  assert.deepEqual(await status(), []);
  await db.exec(`SELECT set_config('request.uid', '${user}', false)`);
  assert.deepEqual(await status(), [{ is_comped: false, expires_at: null }]);
  for (const statement of [
    'SELECT * FROM public.farm_comps',
    `INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${farm}', 'hostile')`,
    `UPDATE public.farm_comps SET deleted_at = now() WHERE farm_id = '${farm}'`,
    `DELETE FROM public.farm_comps WHERE farm_id = '${farm}'`,
  ]) await assert.rejects(db.exec(statement), /permission denied/);
  await db.exec(`RESET ROLE; SET ROLE service_role;
    INSERT INTO public.farm_comps (farm_id, reason, expires_at) VALUES ('${farm}', 'expired', now());
    RESET ROLE; SET ROLE authenticated`);
  assert.deepEqual(await status(), [{ is_comped: false, expires_at: null }]);
  await db.exec(`RESET ROLE; SET ROLE service_role;
    INSERT INTO public.farm_comps (farm_id, reason, expires_at) VALUES ('${farm}', 'live', now() + interval '1 day');
    RESET ROLE; SET ROLE authenticated`);
  assert.equal((await status())[0].is_comped, true);
  assert.ok((await status())[0].expires_at);
  await db.exec(`RESET ROLE; SET ROLE service_role;
    INSERT INTO public.farm_comps (farm_id, reason) VALUES ('${farm}', 'permanent');
    RESET ROLE; SET ROLE authenticated`);
  assert.deepEqual(await status(), [{ is_comped: true, expires_at: null }]);
  await db.exec(`RESET ROLE; SET ROLE service_role;
    UPDATE public.farm_comps SET deleted_at = now() WHERE farm_id = '${farm}';
    RESET ROLE; SET ROLE authenticated`);
  assert.deepEqual(await status(), [{ is_comped: false, expires_at: null }]);
  await db.exec(`SELECT set_config('request.uid', '${farm}', false)`);
  assert.deepEqual(await status(), []);
  await db.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(status(), /permission denied/);
  console.log('Farm comp migration: replay, privileges, membership, expiry, soft deletion and overlap checks passed.');
} finally {
  await db.close();
}
