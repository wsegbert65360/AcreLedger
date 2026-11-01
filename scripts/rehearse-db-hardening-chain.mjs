import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationName, snapshot, printSnapshot, assertHardened } from './db-hardening-fixture.mjs';

// All SQL runs only in this disposable in-memory instance.
// Supabase cron/vault are minimal inert stubs; no external requests are made.
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE supabase_admin; CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA extensions;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT NULL::uuid';
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT current_user::text';
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $jwt$ SELECT '{}'::jsonb $jwt$;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job (jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, jobname text);
    CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS
      'SELECT 1::bigint';
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS
      'SELECT true';
    CREATE PUBLICATION supabase_realtime;
    CREATE SCHEMA vault;
    CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text NOT NULL);
    INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES
      ('mrms_automation_api_key', 'sb_secret_disposable_replay_only'),
      ('mrms_project_url', 'https://replay.supabase.co');
  `);

  console.log('Platform stubs: auth helpers/users, cron schedule/unschedule/job, vault decrypted_secrets, realtime publication. No extensions skipped.');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  let before;
  let after;
  for (const file of files) {
    if (file === migrationName + '.sql') {
      before = await snapshot(db);
      printSnapshot('CHAIN BEFORE', before);
    }
    try { await db.exec(await readFile(new URL(file, dir), 'utf8')); }
    catch (error) { throw new Error('Replay failed at ' + file + ': ' + error.message); }
    if (file === migrationName + '.sql') {
      after = await snapshot(db);
      printSnapshot('CHAIN AFTER', after);
      assertHardened(before, after);
      assert.deepEqual(after.functions.find(f => f.signature.includes('historical_backfills_retired')).proconfig, ['search_path=""']);
    }
  }
  assert(before && after, 'Hardening migration was not rehearsed');
  await db.exec(await readFile(new URL(migrationName + '.sql', dir), 'utf8'));
  assert.deepEqual(await snapshot(db), after);
  console.log('Full-chain rehearsal passed: ' + files.length + ' migrations; hardening replay identical.');
} finally { await db.close(); }
