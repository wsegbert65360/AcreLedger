import assert from 'node:assert/strict';
import test from 'node:test';
import { FARM_TABLE_GUARD_AFTER, checkNewFarmMigrations } from './farm-table-migration-guard.mjs';

const GOOD = `
CREATE TABLE public.notes (
  id uuid PRIMARY KEY,
  farm_id uuid NOT NULL,
  body text,
  deleted_at timestamptz
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notes TO authenticated;
CREATE POLICY "read notes" ON public.notes
  FOR SELECT TO authenticated
  USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()) AND deleted_at IS NULL);
`;

function file(name, sql) {
  return { name, sql };
}

test('cutoff is the latest migration present when the guard was added', () => {
  assert.equal(FARM_TABLE_GUARD_AFTER, '20261110190000');
});

test('a new farm table with the client template passes', () => {
  const problems = checkNewFarmMigrations([
    file('20261113120000_notes.sql', GOOD),
  ]);
  assert.deepEqual(problems, []);
});

test('a service-only farm table does not need a client SELECT policy', () => {
  const sql = `
    CREATE TABLE public.audit_events (
      id uuid PRIMARY KEY,
      farm_id uuid NOT NULL,
      deleted_at timestamptz
    );
    ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.audit_events FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.audit_events TO service_role;
  `;
  assert.deepEqual(checkNewFarmMigrations([file('20261113120000_audit.sql', sql)]), []);
});

test('missing RLS, a DELETE grant, an anon grant, and a soft-delete-blind SELECT policy fail', () => {
  const sql = `
    CREATE TABLE public.widgets (
      id uuid PRIMARY KEY,
      farm_id uuid NOT NULL,
      deleted_at timestamptz
    );
    GRANT SELECT, DELETE ON public.widgets TO authenticated;
    GRANT SELECT ON public.widgets TO anon;
    CREATE POLICY "read widgets" ON public.widgets FOR SELECT USING (farm_id IS NOT NULL);
  `;
  const problems = checkNewFarmMigrations([file('20261113120000_widgets.sql', sql)]);
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /ROW LEVEL SECURITY/);
  assert.match(problems.join('\n'), /anon/);
  assert.match(problems.join('\n'), /DELETE/);
  assert.match(problems.join('\n'), /deleted_at IS NULL/);
});

test('authenticated SELECT with no policy fails', () => {
  const sql = `
    CREATE TABLE public.widgets (id uuid, farm_id uuid, deleted_at timestamptz);
    ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.widgets TO authenticated;
  `;
  const problems = checkNewFarmMigrations([file('20261113120000_widgets.sql', sql)]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SELECT/);
});

test('migrations at or before the cutoff are not re-checked', () => {
  const sql = `CREATE TABLE public.widgets (id uuid, farm_id uuid);`;
  assert.deepEqual(checkNewFarmMigrations([
    file('20261110190000_entitlements_hardening.sql', sql),
    file('20260316090000_core.sql', sql),
  ]), []);
});

test('a table without farm_id and a non-public table are ignored', () => {
  const sql = `
    CREATE TABLE public.lookup (id uuid);
    CREATE TABLE private.secret (id uuid, farm_id uuid);
  `;
  assert.deepEqual(checkNewFarmMigrations([file('20261113120000_other.sql', sql)]), []);
});

test('no new migrations passes', () => {
  assert.deepEqual(checkNewFarmMigrations([]), []);
});
