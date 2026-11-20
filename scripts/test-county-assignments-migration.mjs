import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: 20261119202950_county_assignments.sql.
// Covers constraints, live-only uniqueness, farm isolation (RLS), soft delete, the reference
// boundary table, the bbox RPC and the offline-sync row-state allowlist.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const farmA = uid(1);
const farmB = uid(2);
const userA = uid(3);
const userB = uid(4);
const fieldA = uid(10);
const fieldB = uid(11);
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
const as = (u) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${u}', false); SET ROLE authenticated`);
const asAnon = () => db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE anon`);
const svc = (sql) => db.exec(`RESET ROLE; SET ROLE service_role; ${sql}; RESET ROLE`);
const code = (c) => (e) => e.code === c || e.message.includes(c);

const insert = (over = {}) => {
  const r = {
    id: uid(100 + Math.floor(Math.random() * 1e6)), farm: farmA, type: 'field', key: fieldA, field: `'${fieldA}'`,
    tract: 'NULL', clu: 'NULL', fips: `'29083'`, method: `'geometry'`, manual: 'NULL', ...over,
  };
  return db.query(
    `INSERT INTO public.county_assignments
       (id, farm_id, subject_type, subject_key, field_id, tract_key, clu_number, county_fips, method, manual_acres, mapped_acres, proportion)
     VALUES ('${r.id}', '${r.farm}', '${r.type}', '${r.key}', ${r.field}, ${r.tract}, ${r.clu}, ${r.fips}, ${r.method}, ${r.manual}, 10, 1)`,
  );
};
const cluRow = (over = {}) => insert({ type: 'clu', key: '6418-1417:3', field: 'NULL', tract: `'6418-1417'`, clu: `'3'`, ...over });

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
    CREATE TABLE public.farms (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, farm_id uuid REFERENCES public.farms);
    CREATE TABLE public.fields (id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES public.farms, name text, deleted_at timestamptz,
      CONSTRAINT fields_farm_id_id_key UNIQUE (farm_id, id));
    INSERT INTO public.farms VALUES ('${farmA}'), ('${farmB}');
    INSERT INTO public.profiles VALUES ('${userA}', '${farmA}'), ('${userB}', '${farmB}');
    INSERT INTO public.fields VALUES ('${fieldA}', '${farmA}', 'A'), ('${fieldB}', '${farmB}', 'B');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT SELECT ON public.profiles, public.fields TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  const migration = await mig('20261119202950_county_assignments.sql');
  await db.exec(migration);

  // ---- Constraints (service role bypasses RLS) ----
  await db.exec(`RESET ROLE; SET ROLE service_role`);
  await insert();
  await assert.rejects(insert({ key: uid(999) }), code('county_assignments_subject_shape'), 'field key must equal field id');
  await assert.rejects(insert({ field: 'NULL' }), code('county_assignments_subject_shape'), 'field subject needs field_id');
  await assert.rejects(cluRow({ key: 'wrong' }), code('county_assignments_subject_shape'), 'clu key must be tract:clu');
  await assert.rejects(insert({ fips: 'NULL' }), code('county_assignments_unresolved_has_no_county'), 'a county is required unless unresolved');
  await assert.rejects(insert({ fips: `'29083'`, method: `'unresolved'`, key: fieldA }), code('county_assignments_unresolved_has_no_county'));
  await assert.rejects(insert({ method: `'manual'` }), code('county_assignments_manual_has_acres'), 'manual rows carry manual acres');
  await assert.rejects(insert({ manual: '5' }), code('county_assignments_manual_has_acres'), 'only manual rows carry manual acres');
  await assert.rejects(insert({ fips: `'2908'` }), code('county_assignments_county_fips_check'), 'five-digit FIPS');
  await assert.rejects(insert({ method: `'guess'` }), code('county_assignments_method_check'));

  // ---- Live-only uniqueness: no duplicate live rows, tombstones do not block ----
  await assert.rejects(insert(), code('county_assignments_live_unique'), 'duplicate live county row rejected');
  await insert({ fips: `'29015'` }); // another county for the same subject is fine
  await insert({ fips: 'NULL', method: `'unresolved'` }); // one unresolved marker
  await assert.rejects(insert({ fips: 'NULL', method: `'unresolved'` }), code('county_assignments_live_unique'));
  await db.query(`UPDATE public.county_assignments SET deleted_at = now() WHERE county_fips = '29083'`);
  await insert(); // retired row does not block a fresh live row for the same county
  const live = await db.query(`SELECT count(*)::int AS n FROM public.county_assignments WHERE county_fips = '29083' AND deleted_at IS NULL`);
  assert.equal(live.rows[0].n, 1);
  // Same subject key in another farm is a different subject (tract numbers are not global).
  await cluRow();
  await cluRow({ farm: farmB, field: 'NULL' });
  await assert.rejects(cluRow(), code('county_assignments_live_unique'));

  // ---- RLS: farm isolation, soft delete, no hard delete ----
  await db.exec('RESET ROLE');
  await as(userA);
  const own = await db.query(`SELECT DISTINCT farm_id FROM public.county_assignments`);
  assert.deepEqual(own.rows.map(r => r.farm_id), [farmA]);
  const tomb = await db.query(`SELECT count(*)::int AS n FROM public.county_assignments WHERE deleted_at IS NOT NULL`);
  assert.equal(tomb.rows[0].n, 0, 'client reads never see soft-deleted rows');
  await assert.rejects(insert({ farm: farmB, type: 'clu', key: 'x-1:9', field: 'NULL', tract: `'x-1'`, clu: `'9'` }), code('row-level security'), 'cannot write another farm');
  const crossUpdate = await db.query(`UPDATE public.county_assignments SET review_status = 'reviewed' WHERE farm_id = '${farmB}'`);
  assert.equal(crossUpdate.affectedRows, 0, 'cannot update another farm');
  await assert.rejects(db.query(`DELETE FROM public.county_assignments WHERE farm_id = '${farmA}'`), code('permission denied'), 'no hard delete');
  // Own update works; soft delete works; a deleted row cannot be updated again.
  const upd = await db.query(`UPDATE public.county_assignments SET review_status = 'reviewed' WHERE farm_id = '${farmA}' AND county_fips = '29015'`);
  assert.equal(upd.affectedRows, 1);
  // The SELECT policy hides tombstones, so a direct client UPDATE of deleted_at is rejected by RLS;
  // retiring a row goes through soft_delete_county_assignment.
  await assert.rejects(
    db.query(`UPDATE public.county_assignments SET deleted_at = now() WHERE farm_id = '${farmA}' AND county_fips = '29015'`),
    code('row-level security'), 'direct soft-delete update is not the sanctioned path');
  const target = (await db.query(`SELECT id FROM public.county_assignments WHERE farm_id = '${farmA}' AND county_fips = '29015'`)).rows[0].id;
  await db.query(`SELECT public.soft_delete_county_assignment('${farmA}', '${target}', now())`);
  await db.query(`SELECT public.soft_delete_county_assignment('${farmA}', '${target}', now())`); // repeat is a no-op
  const gone = await db.query(`SELECT count(*)::int AS n FROM public.county_assignments WHERE id = '${target}'`);
  assert.equal(gone.rows[0].n, 0, 'retired row is hidden from the client');
  const revive = await db.query(`UPDATE public.county_assignments SET deleted_at = NULL WHERE id = '${target}'`);
  assert.equal(revive.affectedRows, 0, 'deleted rows cannot be updated or resurrected by clients');
  // Another farm's row can neither be retired nor probed through the function.
  const otherRow = await (async () => { await db.exec('RESET ROLE; SET ROLE service_role'); const r = (await db.query(`SELECT id FROM public.county_assignments WHERE farm_id = '${farmB}' LIMIT 1`)).rows[0].id; await as(userA); return r; })();
  await assert.rejects(db.query(`SELECT public.soft_delete_county_assignment('${farmB}', '${otherRow}', now())`), code('Farm access denied'));
  await db.query(`SELECT public.soft_delete_county_assignment('${farmA}', '${otherRow}', now())`);
  await db.exec('RESET ROLE; SET ROLE service_role');
  const stillThere = await db.query(`SELECT deleted_at FROM public.county_assignments WHERE id = '${otherRow}'`);
  assert.equal(stillThere.rows[0].deleted_at, null, 'a farm-A call cannot retire a farm-B row');
  await as(userA);
  await as(userB);
  const other = await db.query(`SELECT DISTINCT farm_id FROM public.county_assignments`);
  assert.deepEqual(other.rows.map(r => r.farm_id), [farmB]);
  await asAnon();
  await assert.rejects(db.query(`SELECT * FROM public.county_assignments`), code('permission denied'), 'anon has no access');
  await assert.rejects(db.query(`SELECT * FROM public.county_boundaries`), code('permission denied'));

  // ---- Boundary reference table and bbox RPC ----
  await db.exec('RESET ROLE; SET ROLE service_role');
  const county = (version, fips, name, minLng, maxLng, current) => db.query(
    `INSERT INTO public.county_boundaries (dataset_version, fips, name, state_abbr, state_fips, geometry, min_lng, min_lat, max_lng, max_lat, dataset_source, is_current)
     VALUES ('${version}', '${fips}', '${name}', 'MO', '29', '{"type":"Polygon","coordinates":[]}', ${minLng}, 38.3, ${maxLng}, 38.5, 'Test', ${current})`);
  await county('v1', '29083', 'Henry', -93.8, -93.6, 'false');
  await county('v2', '29083', 'Henry', -93.8, -93.6, 'true');
  await county('v2', '29015', 'Benton', -93.6, -93.4, 'true');
  await assert.rejects(county('v3', '29083', 'Henry', -93.8, -93.6, 'true'), code('county_boundaries_current_fips'), 'one current version per county');
  await assert.rejects(db.query(`INSERT INTO public.county_boundaries (dataset_version, fips, name, state_abbr, state_fips, geometry, min_lng, min_lat, max_lng, max_lat, dataset_source)
    VALUES ('v2', '29999', 'Bad', 'MO', '31', '{"type":"Polygon"}', 0, 0, 1, 1, 'T')`), code('county_boundaries_check'));
  await as(userA);
  const west = await db.query(`SELECT fips, dataset_version FROM public.get_county_boundaries(-93.75, 38.4, -93.7, 38.45)`);
  assert.deepEqual(west.rows, [{ fips: '29083', dataset_version: 'v2' }]);
  const both = await db.query(`SELECT fips FROM public.get_county_boundaries(-93.65, 38.4, -93.55, 38.45)`);
  assert.deepEqual(both.rows.map(r => r.fips), ['29015', '29083']);
  const visible = await db.query(`SELECT dataset_version FROM public.county_boundaries WHERE fips = '29083'`);
  assert.deepEqual(visible.rows, [{ dataset_version: 'v2' }], 'clients see only the current version');
  await assert.rejects(db.query(`INSERT INTO public.county_boundaries (dataset_version, fips, name, state_abbr, state_fips, geometry, min_lng, min_lat, max_lng, max_lat, dataset_source)
    VALUES ('v9', '29001', 'X', 'MO', '29', '{"type":"Polygon"}', 0, 0, 1, 1, 'T')`), code('permission denied'), 'clients cannot write boundaries');
  await asAnon();
  await assert.rejects(db.query(`SELECT * FROM public.get_county_boundaries(0, 0, 1, 1)`), code('permission denied'));

  // ---- Offline-sync row state sees county tombstones, only for the caller's farm ----
  await as(userA);
  const tombId = (await db.query(`SELECT id FROM public.county_assignments WHERE 1=0`)).rows;
  assert.deepEqual(tombId, []);
  await db.exec('RESET ROLE; SET ROLE service_role');
  const deletedRow = (await db.query(`SELECT id FROM public.county_assignments WHERE farm_id = '${farmA}' AND deleted_at IS NOT NULL LIMIT 1`)).rows[0].id;
  await as(userA);
  const state = await db.query(`SELECT public.get_offline_sync_row_state('county_assignments', '${deletedRow}', '${farmA}') AS s`);
  assert.ok(state.rows[0].s.deleted_at, 'tombstone visible to the owning farm');
  await assert.rejects(db.query(`SELECT public.get_offline_sync_row_state('county_assignments', '${deletedRow}', '${farmB}')`), code('Farm access denied'));
  await as(userB);
  await assert.rejects(db.query(`SELECT public.get_offline_sync_row_state('county_assignments', '${deletedRow}', '${farmA}')`), code('Farm access denied'));
  await assert.rejects(db.query(`SELECT public.get_offline_sync_row_state('county_boundaries', '${deletedRow}', '${farmB}')`), code('Unsupported offline sync table'));
  await db.exec('RESET ROLE');

  // updated_at moves on update
  await db.exec('SET ROLE service_role');
  const before = (await db.query(`SELECT updated_at FROM public.county_assignments WHERE deleted_at IS NULL AND farm_id = '${farmA}' LIMIT 1`)).rows[0].updated_at;
  await new Promise(r => setTimeout(r, 15));
  await db.query(`UPDATE public.county_assignments SET review_reason = 'x' WHERE deleted_at IS NULL AND farm_id = '${farmA}' AND county_fips = '29083'`);
  const after = (await db.query(`SELECT updated_at FROM public.county_assignments WHERE deleted_at IS NULL AND farm_id = '${farmA}' AND county_fips = '29083'`)).rows[0].updated_at;
  assert.ok(new Date(after) >= new Date(before));
  await db.exec('RESET ROLE');

  console.log('County assignments: constraints, live-only uniqueness, farm isolation, boundary RPC and sync state verified.');
} finally {
  await db.close();
}
