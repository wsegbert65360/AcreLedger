// Isolated PostgreSQL regression test; no network or farm data is used.
// Install @electric-sql/pglite in a temporary directory, then run:
// node scripts/test-h1-migration.mjs <absolute path to pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const apply = async name => db.exec(await migration(name));
const farm = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const field = '00000000-0000-0000-0000-000000000003';
const foreignField = '00000000-0000-0000-0000-000000000004';
const uid = '00000000-0000-0000-0000-000000000005';
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  CREATE TABLE farms (id uuid PRIMARY KEY);
  CREATE TABLE profiles (id uuid PRIMARY KEY, farm_id uuid, active_season integer);
  CREATE TABLE fields (id uuid PRIMARY KEY, farm_id uuid, deleted_at timestamptz);
  GRANT SELECT ON profiles, fields TO authenticated;
  INSERT INTO farms VALUES ('${farm}'), ('${other}');
  INSERT INTO profiles VALUES ('${uid}', '${farm}', 2026);
  INSERT INTO fields VALUES ('${field}', '${farm}', null), ('${foreignField}', '${other}', null);
`);
// Unrelated restore tables need only exist: absent payloads return before reads.
for (const table of ['bins', 'plant_records', 'spray_records', 'harvest_records',
  'hay_harvest_records', 'fertilizer_applications', 'tillage_records', 'grain_movements',
  'saved_seeds', 'fertilizer_recipes', 'spray_recipes', 'custom_spray_records', 'work_requests']) {
  await db.exec(`CREATE TABLE ${table} (id uuid PRIMARY KEY, farm_id uuid, deleted_at timestamptz)`);
}
for (const name of ['20260615100000_fsa_tract_imports', '20260615110000_field_clu_assignments',
  '20260615130000_fix_fsa_tract_persistence', '20260616020643_add_clu_land_use',
  '20260624120000_restore_fsa_clu_backup', '20260624130000_revoke_hard_deletes',
  '20260716015958_preserve_restore_payload_columns', '20260905092000_soft_delete_parity_fsa_clu']) await apply(name);
const latestRestore = await migration('20260723140134_work_requests');
await db.exec(latestRestore.match(/CREATE OR REPLACE FUNCTION public\.restore_farm_backup[\s\S]*?\$\$;/)[0]);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated`);
const tract = { id: '00000000-0000-0000-0000-000000000010', farm_id: farm,
  tract_key: 'H1', filename: 'test.json', feature_count: 0, geojson: {}, deleted_at: null };
const clu = { id: '00000000-0000-0000-0000-000000000011', farm_id: farm,
  field_id: field, tract_key: 'H1', clu_number: '1', acres: 10, land_use: 'cropland', deleted_at: null };
const specs = [['fsa_tract_imports', tract, 'farm_id,tract_key'],
  ['field_clu_assignments', clu, 'farm_id,tract_key,clu_number']];
async function upsert(table, row, conflict, returning = true) {
  const keys = Object.keys(row);
  return db.query(`INSERT INTO ${table} (${keys}) SELECT ${keys} FROM
    jsonb_populate_record(null::${table}, $1::jsonb) ON CONFLICT (${conflict})
    DO UPDATE SET ${keys.map(k => `${k}=EXCLUDED.${k}`).join(',')}
    ${returning ? 'RETURNING *' : ''}`, [JSON.stringify(row)]);
}
for (const [table, , key] of specs) {
  const keyColumns = key.split(',');
  const constraint = (await db.query(`SELECT conname FROM pg_constraint
    WHERE conrelid='${table}'::regclass AND contype='u'`)).rows;
  assert.equal(constraint.length, 1, `${table} keeps its full unique key in the original pending migration`);
  assert.equal(keyColumns.length > 0, true);
}
await db.exec('RESET ROLE');
const correction = '20260905120000_restore_fsa_clu_upsert_contract';
// Also prove the corrective migration safely repairs the already-reviewed bad
// intermediate shape if another environment happened to receive it.
await db.exec(`ALTER TABLE fsa_tract_imports DROP CONSTRAINT fsa_tract_imports_farm_id_tract_key_key;
  CREATE UNIQUE INDEX fsa_tract_imports_farm_tract_key ON fsa_tract_imports(farm_id,tract_key) WHERE deleted_at IS NULL;
  ALTER TABLE field_clu_assignments DROP CONSTRAINT field_clu_assignments_farm_id_tract_key_clu_number_key;
  CREATE UNIQUE INDEX field_clu_assignments_farm_id_tract_key_clu_number_key ON field_clu_assignments(farm_id,tract_key,clu_number) WHERE deleted_at IS NULL;`);
await db.exec('SET ROLE authenticated');
for (const [table, row, key] of specs) await assert.rejects(upsert(table, row, key), { code: '42P10' });
await db.exec('RESET ROLE');
// Duplicate history must abort atomically without deleting or merging records.
await db.exec(`INSERT INTO fsa_tract_imports (farm_id, tract_key, filename, geojson, deleted_at)
  VALUES ('${farm}', 'duplicate', 'a', '{}', now()), ('${farm}', 'duplicate', 'b', '{}', null)`);
await assert.rejects(apply(correction), /duplicate historical keys/);
await db.exec('ROLLBACK');
assert.equal((await db.query("SELECT count(*)::int AS n FROM fsa_tract_imports WHERE tract_key='duplicate'")).rows[0].n, 2);
// Fixture cleanup only; production migration never deletes rows.
await db.exec("DELETE FROM fsa_tract_imports WHERE tract_key='duplicate'");
await apply(correction);
await db.exec('SET ROLE authenticated');
for (const [table, row, key] of specs) {
  assert.equal((await upsert(table, row, key)).rows.length, 1, 'new service insert');
  await db.exec(`UPDATE ${table} SET deleted_at=now() WHERE id='${row.id}'`);
  assert.equal((await db.query(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)).rows.length, 0);
  assert.equal((await upsert(table, row, key)).rows[0].deleted_at, null, 'service resurrection with returning');
  await db.exec(`UPDATE ${table} SET deleted_at=now() WHERE id='${row.id}'`);
  await upsert(table, row, key, false); // offline replay: same target, no RETURNING
  assert.equal((await db.query(`SELECT * FROM ${table} WHERE deleted_at IS NULL`)).rows.length, 1);
  await assert.rejects(upsert(table, { ...row, farm_id: other }, key), { code: '42501' });
  await assert.rejects(db.exec(`UPDATE ${table} SET farm_id='${other}' WHERE id='${row.id}'`), { code: '42501' });
  await assert.rejects(db.exec(`DELETE FROM ${table} WHERE id='${row.id}'`), { code: '42501' });
}
await assert.rejects(upsert('field_clu_assignments', { ...clu, field_id: foreignField }, specs[1][2]), { code: '42501' });
await db.exec('RESET ROLE');
await db.exec(`UPDATE fields SET deleted_at=now() WHERE id='${field}'`);
await db.exec('SET ROLE authenticated');
await assert.rejects(upsert('field_clu_assignments', clu, specs[1][2]), { code: '42501' });
await db.exec('RESET ROLE');
await db.exec(`UPDATE fields SET deleted_at=null WHERE id='${field}'`);
await upsert('fsa_tract_imports', { ...tract, id: '00000000-0000-0000-0000-000000000012', farm_id: other }, specs[0][2]);
await db.exec('SET ROLE authenticated');
assert.equal((await db.query(`SELECT * FROM fsa_tract_imports WHERE farm_id='${other}'`)).rows.length, 0);
for (const [table, row] of specs) await db.exec(`UPDATE ${table} SET deleted_at=now() WHERE id='${row.id}'`);
const payload = { fsa_tract_imports: [{ ...tract, farm_id: other }], field_clu_assignments: [{ ...clu, farm_id: other }] };
const restored = await db.query('SELECT restore_farm_backup($1::jsonb, 2026) AS result', [JSON.stringify(payload)]);
assert.equal(restored.rows[0].result.fsa_tract_imports, 1);
assert.equal(restored.rows[0].result.field_clu_assignments, 1);
for (const [table, row] of specs) {
  const saved = (await db.query(`SELECT * FROM ${table} WHERE id='${row.id}'`)).rows[0];
  assert.equal(saved.deleted_at, null);
  assert.equal(saved.farm_id, farm, 'restore overrides foreign payload farm');
}
// Failed restore remains transactional: the first table must roll back too.
const bad = { fsa_tract_imports: [{ ...tract, filename: 'must-roll-back' }],
  field_clu_assignments: [{ ...clu, field_id: '00000000-0000-0000-0000-000000000099' }] };
await assert.rejects(db.query('SELECT restore_farm_backup($1::jsonb, 2026)', [JSON.stringify(bad)]), { code: '23503' });
assert.equal((await db.query(`SELECT filename FROM fsa_tract_imports WHERE id='${tract.id}'`)).rows[0].filename, tract.filename);
await db.close();
console.log('H1 PostgreSQL regression checks passed: safe pending migration, legacy 42P10 repair, duplicate guard, imports, resurrection, replay SQL, RLS isolation, restore and rollback.');
