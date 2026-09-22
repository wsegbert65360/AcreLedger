import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20260922120000_tenant_scope_harvest_grain_fk.sql', import.meta.url),
  'utf8',
);

const ids = {
  farmA: '00000000-0000-4000-8000-000000000001',
  farmB: '00000000-0000-4000-8000-000000000002',
  harvestA: '00000000-0000-4000-8000-000000000011',
  harvestB: '00000000-0000-4000-8000-000000000012',
  grainA: '00000000-0000-4000-8000-000000000021',
  grainB: '00000000-0000-4000-8000-000000000022',
  grainC: '00000000-0000-4000-8000-000000000023',
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.harvest_records (
      id uuid PRIMARY KEY,
      farm_id uuid NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE public.grain_movements (
      id uuid PRIMARY KEY,
      farm_id uuid NOT NULL,
      harvest_record_id uuid,
      deleted_at timestamptz,
      CONSTRAINT grain_movements_harvest_record_id_fkey
        FOREIGN KEY (harvest_record_id)
        REFERENCES public.harvest_records(id)
        ON DELETE SET NULL
    );
    INSERT INTO public.harvest_records (id, farm_id) VALUES
      ('${ids.harvestA}', '${ids.farmA}'),
      ('${ids.harvestB}', '${ids.farmB}');
  `);
  return db;
}

const dirty = await fixture();
await dirty.exec(`
  INSERT INTO public.grain_movements (id, farm_id, harvest_record_id)
  VALUES ('${ids.grainA}', '${ids.farmB}', '${ids.harvestA}');
`);
await assert.rejects(
  dirty.exec(migration),
  /Cannot farm-scope harvest\/grain relationship: 1 invalid link/,
  'migration must abort before accepting an existing cross-farm link',
);
await dirty.close();

const clean = await fixture();
await clean.exec(`
  INSERT INTO public.grain_movements (id, farm_id, harvest_record_id)
  VALUES ('${ids.grainA}', '${ids.farmA}', '${ids.harvestA}');
`);
await clean.exec(migration);

await clean.exec(`
  INSERT INTO public.grain_movements (id, farm_id, harvest_record_id)
  VALUES ('${ids.grainB}', '${ids.farmB}', '${ids.harvestB}');
`);
await assert.rejects(
  clean.exec(`
    INSERT INTO public.grain_movements (id, farm_id, harvest_record_id)
    VALUES ('${ids.grainC}', '${ids.farmB}', '${ids.harvestA}');
  `),
  /foreign key constraint "grain_movements_farm_harvest_fkey"/,
  'cross-farm links must fail after migration',
);
await assert.rejects(
  clean.exec(`DELETE FROM public.harvest_records WHERE id = '${ids.harvestA}'`),
  /foreign key constraint "grain_movements_farm_harvest_fkey"/,
  'hard deletion of a linked harvest must remain fail-closed',
);

const constraint = await clean.query(`
  SELECT convalidated, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.grain_movements'::regclass
    AND conname = 'grain_movements_farm_harvest_fkey'
`);
assert.equal(constraint.rows.length, 1);
assert.equal(constraint.rows[0].convalidated, true);
assert.match(constraint.rows[0].definition, /FOREIGN KEY \(farm_id, harvest_record_id\)/);

await clean.close();
console.log('Tenant-scoped harvest/grain migration checks passed.');
