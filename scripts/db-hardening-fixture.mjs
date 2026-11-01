import assert from 'node:assert/strict';

export const migrationName = '20261101000000_db_hardening_maintain_search_path';
export const schemas = "'public','acreage_backfill_private','ai_assistant_private','trial_private','usage_private'";
export async function snapshot(db) {
  return {
    grants: (await db.query(`
      SELECT c.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS role,
             a.privilege_type, a.is_grantable
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
      ORDER BY 1,2,3,4`)).rows,
    functions: (await db.query(`SELECT p.oid::regprocedure::text AS signature, p.proconfig, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN (${schemas}) ORDER BY 1`)).rows,
    defaults: (await db.query('SELECT defaclrole, defaclnamespace, defaclobjtype, defaclacl::text FROM pg_default_acl ORDER BY 1,2,3')).rows,
  };
}
export function printSnapshot(label, state) {
  console.log(label);
  console.table(state.grants.filter(row => row.privilege_type === 'MAINTAIN'));
  console.table(state.functions.filter(row => row.signature.includes('historical_backfills_retired')));
}
export function assertPinnedDefiners(state) {
  for (const fn of state.functions.filter(fn => fn.prosecdef)) {
    assert(fn.proconfig?.some(config => config.startsWith('search_path=')), `Unpinned SECURITY DEFINER: ${fn.signature}`);
  }
}
export function assertHardened(before, after) {
  assertPinnedDefiners(before);
  assertPinnedDefiners(after);
  assert.equal(after.grants.filter(g => g.privilege_type === 'MAINTAIN' && ['anon','authenticated','PUBLIC'].includes(g.role)).length, 0);
  assert.deepEqual(after.grants.filter(g => g.privilege_type !== 'MAINTAIN'), before.grants.filter(g => g.privilege_type !== 'MAINTAIN'));
  assert.deepEqual(after.grants.filter(g => g.role === 'service_role'), before.grants.filter(g => g.role === 'service_role'));
  assert.deepEqual(after.functions.map(fn => fn.signature.includes('historical_backfills_retired()') ? {...fn, proconfig: null} : fn),
    before.functions.map(fn => fn.signature.includes('historical_backfills_retired()') ? {...fn, proconfig: null} : fn));
}
