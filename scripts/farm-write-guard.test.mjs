import assert from 'node:assert/strict';
import test from 'node:test';
import { farmOwnedTables, findDeleteViolations, loadFarmOwnedTables } from './farm-write-guard.mjs';

const registry = `
  { schema: "public", table: "fields", ownership: "direct", farmColumn: "farm_id" },
  { schema: "public", table: "profiles", ownership: "user", farmColumn: "farm_id" },
  { schema: "public", table: "farms", ownership: "root", farmColumn: "id" },
  { schema: "ai_assistant_private", table: "turns", ownership: "user" },
`;
const tables = farmOwnedTables(registry);

test('farm-owned tables are public root, direct, and indirect rows', () => {
  assert.equal(tables.has('fields'), true);
  assert.equal(tables.has('farms'), true);
  assert.equal(tables.has('profiles'), false);
  assert.equal(tables.has('turns'), false);
  const live = loadFarmOwnedTables();
  assert.equal(live.has('fields'), true);
  assert.equal(live.has('fsa_tract_imports'), true);
  assert.equal(live.has('field_clu_assignments'), true);
  assert.equal(live.has('profiles'), false);
});

test('flags .delete() on a farm-owned table', () => {
  const source = `await supabase.from('fields').delete().eq('id', id);`;
  const hits = findDeleteViolations(source, 'src/example.ts', tables);
  assert.equal(hits.length, 1);
  assert.match(hits[0].message, /fields/);
});

test('ignores .delete() on a non-farm table and Map.delete', () => {
  const source = `
    await supabase.from('profiles').delete({ count: 'exact' }).eq('id', id);
    cache.delete(key);
    params.delete('billing');
  `;
  assert.deepEqual(findDeleteViolations(source, 'src/example.ts', tables), []);
});

test('flags a non-literal .from().delete() and honors the allowlist comment', () => {
  const bad = `const query = supabase.from(tableName);\nawait query.delete();`;
  assert.equal(findDeleteViolations(bad, 'src/example.ts', tables).length, 1);
  const allowed = `// farm-write-allowlist: delete — not a farm record\nconst query = supabase.from(tableName);\nawait query.delete();`;
  assert.deepEqual(findDeleteViolations(allowed, 'src/example.ts', tables), []);
});

test('does not flag a delete mentioned only in a comment or string', () => {
  const source = `
    // supabase.from('fields').delete()
    const sample = ".from('fields').delete()";
    await supabase.from('fields').update({ deleted_at: now });
  `;
  assert.deepEqual(findDeleteViolations(source, 'src/example.ts', tables), []);
});
