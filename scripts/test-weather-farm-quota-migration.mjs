import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261122200200_weather_farm_quota.sql.
// Free farms stop at 50 weather calls per UTC day, Pro at 500; the farm comes
// from the caller's profile; 'weather-free' is an accepted provider counter.
const db = new PGlite();
const freeFarm = '11111111-1111-4111-8111-111111111111';
const proFarm = '22222222-2222-4222-8222-222222222222';
const users = { free1: 'a0000000-0000-4000-8000-000000000001', free2: 'a0000000-0000-4000-8000-000000000002', pro: 'a0000000-0000-4000-8000-000000000003', none: 'a0000000-0000-4000-8000-000000000004' };
const as = (who) => db.exec(`SELECT set_config('request.uid', '${users[who]}', false)`);
const call = async () => (await db.query('SELECT public.consume_weather_farm_request() AS r')).rows[0].r;

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE SCHEMA weather_proxy_private;
    CREATE SCHEMA usage_private;
    CREATE TABLE usage_private.provider_daily_usage (provider text, day date, count integer, PRIMARY KEY (provider, day));
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid);
    INSERT INTO public.profiles VALUES ('${users.free1}', '${freeFarm}'), ('${users.free2}', '${freeFarm}'),
      ('${users.pro}', '${proFarm}'), ('${users.none}', NULL);
    CREATE TABLE public.entitlement_config (mode text);
    INSERT INTO public.entitlement_config VALUES ('enforce');
    CREATE FUNCTION public.entitlements_mode() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT mode FROM public.entitlement_config $$;
    CREATE FUNCTION public._farm_entitlement(p_farm_id uuid) RETURNS TABLE(plan text) LANGUAGE sql STABLE AS
      $$ SELECT CASE WHEN p_farm_id = '${proFarm}' THEN 'pro' ELSE 'free' END $$;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261122200200_weather_farm_quota.sql', import.meta.url), 'utf8'));

  // Two users on one Free farm share its 50.
  for (let i = 0; i < 50; i += 1) {
    await as(i % 2 ? 'free1' : 'free2');
    assert.deepEqual(await call(), { allowed: true, pro: false }, `free call ${i + 1}`);
  }
  await as('free1');
  assert.deepEqual(await call(), { allowed: false, pro: false }, 'call 51 is refused');
  const { rows: [{ count }] } = await db.query(`SELECT count FROM weather_proxy_private.farm_daily_usage WHERE farm_id = '${freeFarm}'`);
  assert.equal(count, 50, 'refused calls are not counted');

  await as('pro');
  for (let i = 0; i < 500; i += 1) assert.equal((await call()).allowed, true);
  assert.deepEqual(await call(), { allowed: false, pro: true }, 'Pro stops at 500');

  // With enforcement off, every farm gets the Pro limit.
  await db.exec(`UPDATE public.entitlement_config SET mode = 'shadow'; DELETE FROM weather_proxy_private.farm_daily_usage;`);
  await as('free1');
  assert.deepEqual(await call(), { allowed: true, pro: true });

  await as('none');
  assert.deepEqual(await call(), { allowed: false, pro: false }, 'no farm, no weather');
  await db.exec(`SELECT set_config('request.uid', '', false)`);
  assert.deepEqual(await call(), { allowed: false, pro: false }, 'signed out, no weather');

  const inc = async (p) => (await db.query(`SELECT public.increment_provider_daily_usage('${p}', 1) AS ok`)).rows[0].ok;
  assert.equal(await inc('weather-free'), true, 'weather-free is a provider counter');
  assert.equal(await inc('weather-free'), false, 'and it respects its cap');
  assert.equal(await inc('other'), false, 'unknown providers are refused');

  const { rows: [g] } = await db.query(`SELECT
    has_function_privilege('anon', 'public.consume_weather_farm_request()', 'EXECUTE') AS anon,
    has_function_privilege('authenticated', 'public.consume_weather_farm_request()', 'EXECUTE') AS auth,
    has_table_privilege('authenticated', 'weather_proxy_private.farm_daily_usage', 'SELECT') AS tbl`);
  assert.deepEqual(g, { anon: false, auth: true, tbl: false });

  console.log('weather farm quota: all checks passed');
} finally {
  await db.close();
}
