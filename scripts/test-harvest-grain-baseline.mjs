import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationDir = new URL('../supabase/migrations/', import.meta.url);

async function sql(name) {
  return readFile(new URL(name, migrationDir), 'utf8');
}

function createBody(source, table) {
  const match = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(match, `missing CREATE TABLE for ${table}`);
  return match[1];
}

function columnAdds(source, table) {
  return [...source.matchAll(new RegExp(
    `ALTER TABLE public\\.${table}\\s+ADD COLUMN IF NOT EXISTS[\\s\\S]*?;`,
    'gi',
  ))].map((match) => match[0]);
}

const baseline = await sql('20260316090000_core_harvest_grain_baseline.sql');
const harvestBody = createBody(baseline, 'harvest_records');
const grainBody = createBody(baseline, 'grain_movements');
for (const column of ['scale_ticket_number', 'landlord_name', 'crop', 'fsa_farm_number', 'fsa_tract_number', 'harvest_date']) {
  assert.doesNotMatch(harvestBody, new RegExp(`\\b${column}\\b`, 'i'), `bootstrap must leave ${column} to a later migration`);
}
for (const column of ['price', 'destination', 'harvest_record_id', 'version']) {
  assert.doesNotMatch(grainBody, new RegExp(`\\b${column}\\b`, 'i'), `bootstrap must leave ${column} to a later migration`);
}

const laterAdds = [
  ...columnAdds(await sql('20260514120000_align_hay_and_grain_schema.sql'), 'grain_movements'),
  ...columnAdds(await sql('20260514130000_comprehensive_schema_sync.sql'), 'harvest_records'),
  ...columnAdds(await sql('20260514130000_comprehensive_schema_sync.sql'), 'grain_movements'),
  ...columnAdds(await sql('20260906013307_version_grain_movements.sql'), 'grain_movements'),
];
assert.ok(laterAdds.length >= 4, 'expected the later harvest/grain ADD COLUMN statements to remain extractable');

const db = new PGlite();
await db.exec(baseline);
await db.exec(await sql('20260317100000_add_scale_ticket_number.sql'));
await db.exec(await sql('20260318100000_add_landlord_name.sql'));
for (const statement of laterAdds) await db.exec(statement);
await db.exec(await sql('20260701120000_add_harvest_record_id_to_grain_movements.sql'));
await db.exec(await sql('20260825213000_unique_active_grain_movement_per_harvest.sql'));
for (const statement of laterAdds) await db.exec(statement);
await db.exec(await sql('20260922120000_tenant_scope_harvest_grain_fk.sql'));

const columns = await db.query(`
  SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('harvest_records', 'grain_movements')
`);
const byName = new Map(columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
for (const name of [
  'harvest_records.scale_ticket_number',
  'harvest_records.landlord_name',
  'harvest_records.crop',
  'harvest_records.fsa_farm_number',
  'harvest_records.fsa_tract_number',
  'harvest_records.harvest_date',
  'grain_movements.price',
  'grain_movements.destination',
  'grain_movements.harvest_record_id',
]) {
  assert.equal(byName.get(name)?.is_nullable, 'YES', `${name} must remain nullable after ADD COLUMN IF NOT EXISTS`);
}
assert.equal(byName.get('grain_movements.version')?.is_nullable, 'NO');
assert.match(String(byName.get('grain_movements.version')?.column_default), /\b1\b/);

const constraint = await db.query(`
  SELECT convalidated
  FROM pg_constraint
  WHERE conrelid = 'public.grain_movements'::regclass
    AND conname = 'grain_movements_farm_harvest_fkey'
`);
assert.equal(constraint.rows.length, 1);
assert.equal(constraint.rows[0].convalidated, true);

await db.close();
console.log('Harvest/grain bootstrap accepts later ADD COLUMN IF NOT EXISTS migrations.');
