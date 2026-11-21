import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261121120000_soft_delete_farm_rows.sql.
// Proves that a direct client soft delete fails when the SELECT policy hides
// deleted rows, and that the RPC retires rows for the caller's farm only.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const farmA = uid(1);
const farmB = uid(2);
const userA = uid(3);
const userB = uid(4);
const rowA1 = uid(10);
const rowA2 = uid(11);
const rowB = uid(12);
const TABLES = ['custom_spray_records', 'work_requests', 'maintenance_schedules', 'maintenance_logs'];
const as = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const code = (c) => (e) => e.code === c || e.message.includes(c);
const rpc = (table, ids, farm = farmA) => db.query(
  `SELECT public.soft_delete_farm_rows('${farm}', '${table}', ARRAY[${ids.map(id => `'${id}'`).join(',')}]::uuid[]) AS n`,
).then(r => r.rows[0].n);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    INSERT INTO public.farms VALUES ('${farmA}'), ('${farmB}');
    INSERT INTO public.profiles VALUES ('${userA}', '${farmA}'), ('${userB}', '${farmB}');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT SELECT ON public.profiles TO authenticated;
  `);
  // Same policy shape as production (custom_spray_records_select requires deleted_at IS NULL).
  for (const t of TABLES) {
    await db.exec(`
      CREATE TABLE public.${t} (id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, deleted_at timestamptz);
      ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ${t}_select ON public.${t} FOR SELECT TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL);
      CREATE POLICY ${t}_update ON public.${t} FOR UPDATE TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
      CREATE POLICY "Restrict updates on deleted rows" ON public.${t} AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL);
      GRANT SELECT, INSERT, UPDATE ON public.${t} TO authenticated;
      INSERT INTO public.${t} VALUES ('${rowA1}', '${farmA}', NULL), ('${rowA2}', '${farmA}', NULL), ('${rowB}', '${farmB}', NULL);
    `);
  }
  const migration = await readFile(new URL('../supabase/migrations/20261121120000_soft_delete_farm_rows.sql', import.meta.url), 'utf8');
  await db.exec(migration);

  for (const t of TABLES) {
    await as(userA);
    // The bug this migration fixes: a direct client soft delete is refused by RLS.
    await assert.rejects(
      db.query(`UPDATE public.${t} SET deleted_at = now() WHERE id = '${rowA1}' AND farm_id = '${farmA}'`),
      code('row-level security'),
      `${t}: direct client soft delete fails RLS`,
    );
    assert.equal(await rpc(t, [rowA1, rowA1]), 1, `${t}: duplicate ids count once`);
    assert.equal(await rpc(t, [rowA1]), 1, `${t}: repeat is a no-op that still counts as deleted`);
    const visible = await db.query(`SELECT id FROM public.${t}`);
    assert.deepEqual(visible.rows.map(r => r.id), [rowA2], `${t}: deleted row hidden, other row kept`);
    assert.equal(await rpc(t, [rowB]), 0, `${t}: another farm's id is not touched`);
    await assert.rejects(rpc(t, [rowB], farmB), code('42501'), `${t}: cannot act for another farm`);
    await db.exec('RESET ROLE');
    const b = await db.query(`SELECT deleted_at FROM public.${t} WHERE id = '${rowB}'`);
    assert.equal(b.rows[0].deleted_at, null, `${t}: farm B row still live`);
  }

  await as(userA);
  await assert.rejects(rpc('fields', [rowA2]), code('22023'), 'non-allowlisted table refused');
  await assert.rejects(rpc('custom_spray_records; DROP TABLE public.farms', [rowA2]), code('22023'), 'table name is allowlisted, not interpolated');
  assert.equal(await rpc('work_requests', []), 0, 'empty id list is a no-op');
  const future = await db.query(
    `SELECT public.soft_delete_farm_rows('${farmA}', 'work_requests', ARRAY['${rowA2}']::uuid[], now() + interval '1 year') AS n`,
  );
  assert.equal(future.rows[0].n, 1);
  await db.exec('RESET ROLE');
  const ts = await db.query(`SELECT deleted_at <= now() AS ok FROM public.work_requests WHERE id = '${rowA2}'`);
  assert.equal(ts.rows[0].ok, true, 'future deleted_at is clamped to now');

  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE anon`);
  await assert.rejects(rpc('work_requests', [rowA2]), code('permission denied'), 'anon cannot execute');

  console.log('soft_delete_farm_rows migration: all checks passed');
} finally {
  await db.close();
}
