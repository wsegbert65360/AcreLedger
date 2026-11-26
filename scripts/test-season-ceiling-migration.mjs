import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261122200100_season_ceiling_earliest_timezone.sql.
// The season ceiling is next year at UTC+14, the CHECKs use it, and the two
// RPCs have their UTC ceiling swapped in place. Production default privileges
// grant EXECUTE only to the owner and service_role, so the writing role must
// still be able to call the ceiling, and a second run must leave the RPCs patched.
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, active_season integer,
      CONSTRAINT profiles_active_season_valid CHECK (active_season IS NULL OR
        (active_season >= 2000 AND active_season <= EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1)));
    CREATE TABLE public.work_requests (id uuid PRIMARY KEY, crop_year integer,
      CONSTRAINT work_requests_crop_year_range CHECK (crop_year BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::int + 1));
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
    INSERT INTO public.profiles VALUES (gen_random_uuid(), 2026);
    CREATE FUNCTION public._restore_farm_backup_impl(p jsonb, s integer) RETURNS boolean LANGUAGE plpgsql AS $f$
    BEGIN
      RETURN s <= EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1;
    END $f$;
    CREATE FUNCTION public.start_pre_season_reset(p_from_season integer, p_to_season integer) RETURNS boolean LANGUAGE plpgsql AS $f$
    DECLARE v_year integer := EXTRACT(YEAR FROM pg_catalog.now())::integer;
    BEGIN
      RETURN NOT (p_to_season > v_year + 1);
    END $f$;
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261122200100_season_ceiling_earliest_timezone.sql', import.meta.url), 'utf8');
  await db.exec(migration);

  const { rows: [{ c, plus14 }] } = await db.query(`SELECT public._season_year_ceiling() AS c,
    EXTRACT(YEAR FROM (now() AT TIME ZONE 'Etc/GMT-14'))::int + 1 AS plus14`);
  assert.equal(c, plus14, 'ceiling is next year at UTC+14');

  await db.query(`INSERT INTO public.profiles VALUES (gen_random_uuid(), ${c})`);
  await assert.rejects(db.query(`INSERT INTO public.profiles VALUES (gen_random_uuid(), ${c + 1})`), /profiles_active_season_valid/);
  await assert.rejects(db.query(`INSERT INTO public.profiles VALUES (gen_random_uuid(), 1999)`), /profiles_active_season_valid/);
  await db.query(`INSERT INTO public.work_requests VALUES (gen_random_uuid(), ${c})`);
  await assert.rejects(db.query(`INSERT INTO public.work_requests VALUES (gen_random_uuid(), ${c + 1})`), /work_requests_crop_year_range/);

  for (const fn of ['_restore_farm_backup_impl(jsonb, integer)', 'start_pre_season_reset(integer, integer)']) {
    const { rows: [{ d }] } = await db.query(`SELECT pg_get_functiondef('public.${fn}'::regprocedure) AS d`);
    assert.match(d, /public\._season_year_ceiling\(\)/, `${fn} uses the ceiling`);
    assert.doesNotMatch(d, /CURRENT_DATE\)::integer \+ 1|v_year \+ 1/, `${fn} has no UTC ceiling left`);
  }
  const { rows: [{ ok }] } = await db.query(`SELECT public.start_pre_season_reset(${c - 1}, ${c}) AS ok`);
  assert.equal(ok, true, 'reset into the ceiling year is allowed');

  const { rows: [{ can }] } = await db.query(`SELECT has_function_privilege('authenticated', 'public._season_year_ceiling()', 'EXECUTE') AS can`);
  assert.equal(can, true, 'authenticated can execute the season ceiling');

  const { rows: [{ id }] } = await db.query(`SELECT id FROM public.profiles LIMIT 1`);
  await db.exec('SET ROLE authenticated');
  try {
    const updated = await db.query(`UPDATE public.profiles SET active_season = ${c} WHERE id = '${id}' RETURNING id`);
    assert.equal(updated.rows.length, 1, 'authenticated update of profiles succeeds');
  } finally {
    await db.exec('RESET ROLE');
  }

  await db.exec(migration);
  for (const fn of ['_restore_farm_backup_impl(jsonb, integer)', 'start_pre_season_reset(integer, integer)']) {
    const { rows: [{ d }] } = await db.query(`SELECT pg_get_functiondef('public.${fn}'::regprocedure) AS d`);
    assert.match(d, /public\._season_year_ceiling\(\)/, `${fn} still uses the ceiling after a second run`);
  }

  console.log('season ceiling (UTC+14): all checks passed');
} finally {
  await db.close();
}
