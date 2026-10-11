// Isolated PostgreSQL replay of supabase/migrations. No network and no remote database.
// Uses the same disposable PGlite fixture as scripts/verify-supabase-migrations.mjs.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const root = resolve(import.meta.dirname, '..');
const migrationDir = resolve(root, 'supabase/migrations');
const target = '20261011230000_db_access_review_02.sql';

const ids = {
  spoofFarm: '00000000-0000-4000-8000-0000000000b1',
  appFarm: '00000000-0000-4000-8000-0000000000b2',
  realFarm: '00000000-0000-4000-8000-0000000000b3',
  explicitFarm: '00000000-0000-4000-8000-0000000000b4',
  newUser: '00000000-0000-4000-8000-0000000000c1',
  keptUser: '00000000-0000-4000-8000-0000000000c2',
  replayUser: '00000000-0000-4000-8000-0000000000c3',
};

const triggerFunctions = ['handle_new_user', 'assign_tenant_id', 'sync_farm_id_to_auth'];
const rollupFunctions = [
  'rollup_farm_rainfall',
  'rollup_all_farms_daily',
  'rollup_field_rainfall',
  'cleanup_old_rainfall',
];
const rainfallTables = [
  'field_rainfall_hourly',
  'field_rainfall_coverage',
  'field_rainfall_daily',
  'farm_rainfall_daily',
];

function jsonValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function roleList(roles) {
  if (Array.isArray(roles)) return roles.map(String);
  const text = String(roles ?? '').trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    if (text === '{}') return [];
    return text.slice(1, -1).split(',').filter(Boolean).map((part) => part.replace(/^"(.*)"$/, '$1'));
  }
  return text ? [text] : [];
}

function isBareTrue(expr) {
  if (expr == null) return false;
  return String(expr).replace(/[\s()]/g, '').toLowerCase() === 'true';
}

const files = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
assert.equal(files.at(-1), target, 'review-02 migration must be the latest file');
const migrationSql = new Map();
for (const file of files) {
  migrationSql.set(file, await readFile(resolve(migrationDir, file), 'utf8'));
}
const reviewSql = migrationSql.get(target);
assert.doesNotMatch(reviewSql, /user_metadata|raw_user_meta_data/i, 'migration must not read signup metadata');
assert.doesNotMatch(
  reviewSql,
  /\b(drop|alter|update|insert|delete|grant|revoke|create)\b[^;]*\brainfall_settings\b/i,
  'migration must not change rainfall_settings',
);

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT NULL::uuid';
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

  async function apply(file) {
    try {
      await db.exec(migrationSql.get(file));
    } catch (err) {
      const message = (err && err.message ? err.message : String(err)).split('\n')[0];
      throw new Error(`${file} failed: ${message}`, { cause: err });
    }
  }

  for (const file of files.slice(0, -1)) await apply(file);

  async function settingsSnapshot() {
    const relation = await db.query(`
      SELECT c.relkind, c.relrowsecurity,
             COALESCE((
               SELECT string_agg(a.attname || ':' || a.atttypid::regtype::text, ',' ORDER BY a.attnum)
               FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
             ), '') AS columns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'rainfall_settings'
    `);
    const policies = await db.query(`
      SELECT policyname, cmd, roles::text AS roles, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'rainfall_settings'
      ORDER BY policyname, cmd
    `);
    return { relation: relation.rows, policies: policies.rows };
  }

  const settingsBefore = await settingsSnapshot();
  await apply(target);
  const settingsAfter = await settingsSnapshot();
  assert.deepEqual(settingsAfter, settingsBefore, 'rainfall_settings must be unchanged');

  const legacyPolicies = await db.query(`
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE policyname = 'Allow authenticated read access'
  `);
  assert.equal(legacyPolicies.rows.length, 0, 'legacy rainfall read policy must be absent');

  const gaps = await db.query(`
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'rainfall_coverage_gaps'
  `);
  assert.equal(gaps.rows.length, 0, 'rainfall_coverage_gaps must not exist');
  assert.equal((await db.query(`SELECT to_regclass('public.rainfall_coverage_gaps') AS rel`)).rows[0].rel, null);

  const rainfallPolicies = await db.query(`
    SELECT tablename, policyname, roles, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
  `, [rainfallTables]);
  for (const policy of rainfallPolicies.rows) {
    if (!isBareTrue(policy.qual)) continue;
    const outsiders = roleList(policy.roles).filter((role) => role !== 'service_role');
    assert.deepEqual(
      outsiders,
      [],
      `${policy.tablename} policy ${policy.policyname} has USING(true) for ${outsiders.join(', ') || 'no role'}`,
    );
  }

  async function privileges(name) {
    return (await db.query(`
      SELECT p.oid::regprocedure::text AS signature,
             p.prosecdef,
             p.proconfig,
             pg_get_functiondef(p.oid) AS definition,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
             has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1
      ORDER BY 1
    `, [name])).rows;
  }

  function assertSearchPath(row) {
    const config = Array.isArray(row.proconfig) ? row.proconfig.join(',') : String(row.proconfig ?? '');
    assert.match(config, /search_path=public,\s*extensions/, `${row.signature} search_path`);
    assert.equal(row.prosecdef, true, `${row.signature} must be SECURITY DEFINER`);
  }

  function assertClientDenied(row) {
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.equal(row[role], false, `${role} must not EXECUTE ${row.signature}`);
    }
  }

  for (const name of triggerFunctions) {
    const rows = await privileges(name);
    assert.equal(rows.length, 1, `${name} must exist`);
    assertSearchPath(rows[0]);
    assertClientDenied(rows[0]);
    assert.equal(rows[0].service_role, false, `service_role must not EXECUTE ${name}`);
    assert.doesNotMatch(rows[0].definition, /user_metadata|raw_user_meta_data/i);
  }

  const handleDef = (await privileges('handle_new_user'))[0].definition;
  assert.match(handleDef, /INSERT INTO public\.profiles \(id, email\)/);
  assert.match(handleDef, /ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(handleDef, /farm_id/i);

  const assignDef = (await privileges('assign_tenant_id'))[0].definition;
  assert.match(assignDef, /app_metadata/);
  assert.match(assignDef, /FROM public\.profiles/);
  assert.doesNotMatch(assignDef, /user_metadata|raw_user_meta_data/i);

  const syncDef = (await privileges('sync_farm_id_to_auth'))[0].definition;
  assert.match(syncDef, /raw_app_meta_data/);

  for (const name of ['rollup_farm_rainfall', 'rollup_all_farms_daily']) {
    const rows = await privileges(name);
    assert.equal(rows.length, 1, `${name} must exist in this history`);
    assertClientDenied(rows[0]);
    assert.equal(rows[0].service_role, true, `service_role must EXECUTE ${name}`);
  }
  for (const name of ['rollup_field_rainfall', 'cleanup_old_rainfall']) {
    const rows = await privileges(name);
    assert.equal(rows.length, 0, `${name} is absent from this replay, so clients cannot execute it`);
  }

  const triggers = await db.query(`
    SELECT t.tgname, n.nspname AS schema_name, c.relname, p.proname, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND t.tgname IN ('on_auth_user_created', 'tr_sync_farm_id_to_auth')
    ORDER BY t.tgname
  `);
  assert.deepEqual(
    triggers.rows.map((row) => [row.tgname, row.schema_name, row.relname, row.proname]),
    [
      ['on_auth_user_created', 'auth', 'users', 'handle_new_user'],
      ['tr_sync_farm_id_to_auth', 'public', 'profiles', 'sync_farm_id_to_auth'],
    ],
  );
  assert.match(triggers.rows[0].definition, /AFTER INSERT/i);
  assert.match(triggers.rows[1].definition, /AFTER INSERT OR UPDATE OF farm_id/i);

  // Production auth.users has these columns. The verify fixture creates only id;
  // the trigger reads email, and sync writes raw_app_meta_data, at execution time.
  await db.exec(`
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), ''),
           NULLIF(current_setting('request.jwt.claim', true), '')
         )::jsonb $$;
  `);

  async function asRole(role, fn) {
    await db.exec(`SET ROLE ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec('RESET ROLE');
    }
  }

  async function assertExecuteDenied(role, sql, params = []) {
    await asRole(role, () => assert.rejects(db.query(sql, params), { code: '42501' }));
  }

  const deniedCalls = [
    ['SELECT public.handle_new_user()', []],
    ['SELECT public.assign_tenant_id()', []],
    ['SELECT public.sync_farm_id_to_auth()', []],
    ['SELECT public.rollup_farm_rainfall($1::uuid, $2::date)', [ids.realFarm, '2026-10-01']],
    ['SELECT public.rollup_all_farms_daily($1::date)', ['2026-10-01']],
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const [sql, params] of deniedCalls) await assertExecuteDenied(role, sql, params);
  }

  await asRole('service_role', async () => {
    await db.query('SELECT public.rollup_farm_rainfall($1::uuid, $2::date)', [ids.realFarm, '2026-10-01']);
    await db.query('SELECT public.rollup_all_farms_daily($1::date)', ['2026-10-01']);
  });

  await db.query(
    `INSERT INTO public.farms (id, name) VALUES ($1::uuid, 'Review Farm')`,
    [ids.realFarm],
  );

  const spoofMeta = { farm_id: ids.spoofFarm, full_name: 'Not A Member' };
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
     VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)`,
    [
      ids.newUser,
      'attacker@example.com',
      JSON.stringify(spoofMeta),
      JSON.stringify({ provider: 'email', farm_id: ids.spoofFarm }),
    ],
  );
  const created = (await db.query(
    `SELECT id, email, farm_id::text AS farm_id FROM public.profiles WHERE id = $1::uuid`,
    [ids.newUser],
  )).rows;
  assert.equal(created.length, 1, 'signup must create a profile');
  assert.equal(created[0].email, 'attacker@example.com');
  assert.equal(created[0].farm_id, null, 'signup metadata must not set profiles.farm_id');
  const createdMeta = jsonValue((await db.query(
    `SELECT raw_app_meta_data FROM auth.users WHERE id = $1::uuid`,
    [ids.newUser],
  )).rows[0].raw_app_meta_data);
  assert.equal(createdMeta.provider, 'email', 'sync must preserve other app_metadata keys');
  assert.equal(createdMeta.farm_id ?? null, null, 'a null profile farm_id must not publish a spoofed farm');

  await db.query(
    `INSERT INTO public.profiles (id, email, farm_id) VALUES ($1::uuid, 'kept@example.com', $2::uuid)`,
    [ids.keptUser, ids.realFarm],
  );
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES ($1::uuid, 'replaced@example.com', $2::jsonb)`,
    [ids.keptUser, JSON.stringify({ farm_id: ids.spoofFarm })],
  );
  const kept = (await db.query(
    `SELECT email, farm_id::text AS farm_id FROM public.profiles WHERE id = $1::uuid`,
    [ids.keptUser],
  )).rows[0];
  assert.equal(kept.email, 'kept@example.com', 'ON CONFLICT (id) DO NOTHING must not overwrite the profile');
  assert.equal(kept.farm_id, ids.realFarm);

  await db.query(
    `UPDATE public.profiles SET farm_id = $2::uuid WHERE id = $1::uuid`,
    [ids.newUser, ids.realFarm],
  );
  const synced = jsonValue((await db.query(
    `SELECT raw_app_meta_data FROM auth.users WHERE id = $1::uuid`,
    [ids.newUser],
  )).rows[0].raw_app_meta_data);
  assert.equal(synced.farm_id, ids.realFarm, 'profile farm_id must be merged into app_metadata');
  assert.equal(synced.provider, 'email');

  await db.query(`UPDATE public.profiles SET farm_id = NULL WHERE id = $1::uuid`, [ids.newUser]);
  const cleared = jsonValue((await db.query(
    `SELECT raw_app_meta_data FROM auth.users WHERE id = $1::uuid`,
    [ids.newUser],
  )).rows[0].raw_app_meta_data);
  assert.equal(cleared.farm_id ?? null, null, 'clearing profile farm_id must remove app_metadata.farm_id');
  assert.equal(cleared.provider, 'email');

  await db.exec(`
    CREATE TABLE public.assign_tenant_probe (
      id uuid PRIMARY KEY,
      farm_id uuid
    );
    CREATE TRIGGER assign_tenant_probe_bi
      BEFORE INSERT ON public.assign_tenant_probe
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_tenant_id();
  `);

  async function setJwt(sub, claims) {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
  }

  async function assignProbe(probeId, farmId) {
    await db.query(
      `INSERT INTO public.assign_tenant_probe (id, farm_id) VALUES ($1::uuid, $2::uuid)`,
      [probeId, farmId],
    );
    return (await db.query(
      `SELECT farm_id::text AS farm_id FROM public.assign_tenant_probe WHERE id = $1::uuid`,
      [probeId],
    )).rows[0].farm_id;
  }

  await setJwt(ids.newUser, {
    sub: ids.newUser,
    user_metadata: { farm_id: ids.spoofFarm },
    app_metadata: { farm_id: ids.appFarm },
  });
  await db.query(`UPDATE public.profiles SET farm_id = $2::uuid WHERE id = $1::uuid`, [ids.newUser, ids.realFarm]);
  assert.equal(
    await assignProbe('00000000-0000-4000-8000-0000000000d2', null),
    ids.realFarm,
    'the profile farm_id wins over app_metadata and user_metadata',
  );

  await db.query(`UPDATE public.profiles SET farm_id = NULL WHERE id = $1::uuid`, [ids.newUser]);
  await setJwt(ids.newUser, {
    sub: ids.newUser,
    user_metadata: { farm_id: ids.spoofFarm },
    app_metadata: { farm_id: ids.appFarm },
  });
  assert.equal(
    await assignProbe('00000000-0000-4000-8000-0000000000d3', null),
    ids.appFarm,
    'app_metadata is the fallback when the profile has no farm',
  );

  await setJwt(ids.newUser, {
    sub: ids.newUser,
    user_metadata: { farm_id: ids.spoofFarm },
    app_metadata: {},
  });
  assert.equal(
    await assignProbe('00000000-0000-4000-8000-0000000000d4', null),
    null,
    'user_metadata.farm_id must not assign a tenant',
  );

  await setJwt(ids.newUser, {
    sub: ids.newUser,
    app_metadata: { farm_id: 'not-a-uuid' },
    user_metadata: { farm_id: ids.spoofFarm },
  });
  assert.equal(await assignProbe('00000000-0000-4000-8000-0000000000d5', null), null);

  assert.equal(
    await assignProbe('00000000-0000-4000-8000-0000000000d6', ids.explicitFarm),
    ids.explicitFarm,
    'a supplied farm_id is left unchanged',
  );

  // Re-applying the migration must revoke signatures that are absent from history
  // but present in production.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.rollup_field_rainfall(p_field_id uuid, p_date date, p_timezone text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, extensions
    AS $$ BEGIN RETURN; END $$;
    CREATE OR REPLACE FUNCTION public.cleanup_old_rainfall()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, extensions
    AS $$ BEGIN RETURN; END $$;
    GRANT EXECUTE ON FUNCTION public.rollup_field_rainfall(uuid, date, text) TO PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.cleanup_old_rainfall() TO PUBLIC, anon, authenticated;
  `);
  await apply(target);
  assert.deepEqual(await settingsSnapshot(), settingsBefore, 're-applying must still leave rainfall_settings untouched');

  for (const name of rollupFunctions) {
    const rows = await privileges(name);
    assert.equal(rows.length, 1, `${name} must be revoked when present`);
    assertClientDenied(rows[0]);
    assert.equal(rows[0].service_role, true, `service_role must EXECUTE ${name}`);
  }
  for (const role of ['anon', 'authenticated']) {
    await assertExecuteDenied(role, 'SELECT public.rollup_field_rainfall($1::uuid, $2::date, $3)', [ids.realFarm, '2026-10-01', 'America/Chicago']);
    await assertExecuteDenied(role, 'SELECT public.cleanup_old_rainfall()');
  }
  await asRole('service_role', async () => {
    await db.query('SELECT public.cleanup_old_rainfall()');
    await db.query(
      'SELECT public.rollup_field_rainfall($1::uuid, $2::date, $3)',
      [ids.realFarm, '2026-10-01', 'America/Chicago'],
    );
  });

  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data)
     VALUES ($1::uuid, 'replay@example.com', $2::jsonb)`,
    [ids.replayUser, JSON.stringify({ farm_id: ids.spoofFarm })],
  );
  const replayed = (await db.query(
    `SELECT email, farm_id::text AS farm_id FROM public.profiles WHERE id = $1::uuid`,
    [ids.replayUser],
  )).rows[0];
  assert.equal(replayed.email, 'replay@example.com');
  assert.equal(replayed.farm_id, null, 're-applied handle_new_user still ignores signup metadata');

  console.log('Review-02 access checks passed: signup metadata ignored, legacy policy and view absent, client execute revoked, service_role retains rollup.');
} finally {
  await db.close();
}
