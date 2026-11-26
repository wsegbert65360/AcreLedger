import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261122140026_core_select_policies_match_production.sql.
// Before: a client soft delete on a core table fails RLS (SELECT policy filters
// deleted_at). After: it succeeds, edits to deleted rows are still refused,
// and another farm's rows stay invisible.
const db = new PGlite();
const farmA = '11111111-1111-4111-8111-111111111111';
const farmB = '22222222-2222-4222-8222-222222222222';
const userA = '33333333-3333-4333-8333-333333333333';
const binA = '44444444-4444-4444-8444-444444444444';
const binB = '55555555-5555-4555-8555-555555555555';
const asUser = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${userA}', false); SET ROLE authenticated`);
const softDelete = () => db.query(`UPDATE public.bins SET deleted_at = now() WHERE id = '${binA}' AND farm_id = '${farmA}'`);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    INSERT INTO public.farms VALUES ('${farmA}'), ('${farmB}');
    INSERT INTO public.profiles VALUES ('${userA}', '${farmA}');
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON public.profiles TO authenticated;
  `);
  for (const t of ['fields', 'bins', 'plant_records', 'spray_records', 'harvest_records', 'hay_harvest_records',
    'fertilizer_applications', 'tillage_records', 'grain_movements', 'saved_seeds', 'fertilizer_recipes', 'spray_recipes']) {
    // The policy set 20260628100000 leaves behind.
    await db.exec(`
      CREATE TABLE public.${t} (id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, name text, deleted_at timestamptz);
      ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON public.${t} TO authenticated;
      CREATE POLICY "Users can select their farm data" ON public.${t} FOR SELECT TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL);
      CREATE POLICY "Users can update their farm data" ON public.${t} FOR UPDATE TO authenticated
        USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
        WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
      CREATE POLICY "Restrict updates on deleted rows" ON public.${t} AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);
    `);
  }
  await db.exec(`INSERT INTO public.bins (id, farm_id, name) VALUES ('${binA}', '${farmA}', 'Bin 1'), ('${binB}', '${farmB}', 'Other farm')`);

  await asUser();
  await assert.rejects(softDelete(), /row-level security/, 'before: core soft delete fails RLS');
  await db.exec('RESET ROLE');

  await db.exec(await readFile(new URL('../supabase/migrations/20261122140026_core_select_policies_match_production.sql', import.meta.url), 'utf8'));

  await asUser();
  assert.equal((await softDelete()).affectedRows, 1, 'after: core soft delete succeeds');
  const edit = await db.query(`UPDATE public.bins SET name = 'edited' WHERE id = '${binA}'`);
  assert.equal(edit.affectedRows, 0, 'edits to a deleted row match nothing');
  const visible = await db.query('SELECT id FROM public.bins');
  assert.deepEqual(visible.rows.map(r => r.id), [binA], 'own tombstone readable, other farm hidden');
  const policies = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname = 'Users can select their farm data' AND qual LIKE '%deleted_at%'`);
  assert.equal(policies.rows[0].n, 0, 'no core SELECT policy filters deleted_at');

  console.log('core SELECT policies match production: all checks passed');
} finally {
  await db.close();
}
