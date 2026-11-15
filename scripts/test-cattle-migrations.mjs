import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql', import.meta.url),
  'utf8',
);
const restoreHelpers = await readFile(
  new URL('../supabase/migrations/20260716015958_preserve_restore_payload_columns.sql', import.meta.url),
  'utf8',
);
const restoreMigration = await readFile(
  new URL('../supabase/migrations/20261114130000_cattle_restore_and_reconciliation.sql', import.meta.url),
  'utf8',
);

const ids = {
  farm: '10000000-0000-4000-8000-000000000001',
  otherFarm: '10000000-0000-4000-8000-000000000002',
  user: '10000000-0000-4000-8000-000000000003',
  fieldA: '10000000-0000-4000-8000-000000000011',
  fieldB: '10000000-0000-4000-8000-000000000012',
  otherField: '10000000-0000-4000-8000-000000000013',
  group: '10000000-0000-4000-8000-000000000021',
  otherGroup: '10000000-0000-4000-8000-000000000022',
  cascadeGroup: '10000000-0000-4000-8000-000000000023',
  currentMove: '10000000-0000-4000-8000-000000000031',
  backdatedMove: '10000000-0000-4000-8000-000000000032',
  offFarmMove: '10000000-0000-4000-8000-000000000033',
  addedEvent: '10000000-0000-4000-8000-000000000041',
  deathEvent: '10000000-0000-4000-8000-000000000042',
  tooManyRemovedEvent: '10000000-0000-4000-8000-000000000043',
  cascadeMove: '10000000-0000-4000-8000-000000000051',
  cascadeEvent: '10000000-0000-4000-8000-000000000052',
};

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    CREATE TABLE public.farms (
      id uuid PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE
    );
    CREATE TABLE public.fields (
      id uuid PRIMARY KEY,
      farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
      name text NOT NULL,
      deleted_at timestamptz,
      UNIQUE (farm_id, id)
    );
    INSERT INTO public.farms (id, name) VALUES
      ('${ids.farm}', 'Home Farm'),
      ('${ids.otherFarm}', 'Other Farm');
    INSERT INTO public.profiles (id, farm_id) VALUES ('${ids.user}', '${ids.farm}');
    INSERT INTO public.fields (id, farm_id, name) VALUES
      ('${ids.fieldA}', '${ids.farm}', 'North Pasture'),
      ('${ids.fieldB}', '${ids.farm}', 'South Pasture'),
      ('${ids.otherField}', '${ids.otherFarm}', 'Other Pasture');
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT SELECT ON public.profiles TO authenticated;
    GRANT SELECT ON public.farms TO authenticated;
  `);
  await db.exec(migration);
  await db.exec(`
    CREATE FUNCTION public.restore_farm_backup(jsonb, integer DEFAULT NULL)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  `);
  await db.exec(restoreHelpers);
  await db.exec(`
    ALTER FUNCTION public.restore_farm_backup(jsonb, integer) RENAME TO _restore_farm_backup_impl;
    CREATE FUNCTION public.assert_premium(uuid, text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  `);
  await db.exec(restoreMigration);

  assert.equal(
    (await db.query(`SELECT runs_cattle FROM public.farms WHERE id = '${ids.farm}'`)).rows[0].runs_cattle,
    false,
    'runs_cattle defaults off',
  );

  await db.exec(`
    INSERT INTO public.cattle_groups (id, farm_id, name, class, head_count) VALUES
      ('${ids.group}', '${ids.farm}', 'Spring Cows', 'cows', 20),
      ('${ids.otherGroup}', '${ids.otherFarm}', 'Other Cows', 'cows', 9),
      ('${ids.cascadeGroup}', '${ids.farm}', 'Fall Calves', 'calves', 6);
    SELECT set_config('request.uid', '${ids.user}', false);
    SET ROLE authenticated;
  `);

  const visibleGroups = await db.query('SELECT id FROM public.cattle_groups ORDER BY id');
  assert.deepEqual(
    visibleGroups.rows.map(row => row.id),
    [ids.cascadeGroup, ids.group].sort(),
    'RLS exposes only active rows from the caller farm',
  );

  assert.equal(
    (await db.query('SELECT public.set_runs_cattle($1, $2) AS value', [ids.farm, true])).rows[0].value,
    true,
  );
  assert.equal(
    (await db.query(`SELECT runs_cattle FROM public.farms WHERE id = '${ids.farm}'`)).rows[0].runs_cattle,
    true,
  );
  await assert.rejects(
    db.query('SELECT public.set_runs_cattle($1, $2)', [ids.otherFarm, true]),
    error => error.code === '42501',
  );

  const move = (moveId, fieldId, movedOn, notes = null, farmId = ids.farm, groupId = ids.group) => db.query(
    'SELECT public.move_cattle_group($1,$2,$3,$4,$5,$6) AS value',
    [farmId, moveId, groupId, fieldId, movedOn, notes],
  );

  const firstMove = await move(ids.currentMove, ids.fieldA, '2026-11-10');
  assert.equal(firstMove.rows[0].value.already_applied, false);
  assert.equal(firstMove.rows[0].value.current_updated, true);
  assert.equal(firstMove.rows[0].value.head_count, 20);

  const backdatedMove = await move(ids.backdatedMove, ids.fieldB, '2026-11-01');
  assert.equal(backdatedMove.rows[0].value.current_updated, false);
  const currentPasture = (
    await db.query(`SELECT current_field_id, current_since FROM public.cattle_groups WHERE id = '${ids.group}'`)
  ).rows[0];
  assert.equal(currentPasture.current_field_id, ids.fieldA);
  assert.equal(currentPasture.current_since.toISOString().slice(0, 10), '2026-11-10');
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.cattle_moves WHERE group_id = '${ids.group}'`)).rows[0].count, 2);

  const repeatedMove = await move(ids.currentMove, ids.fieldA, '2026-11-10');
  assert.equal(repeatedMove.rows[0].value.already_applied, true, 'move replay is idempotent');
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.cattle_moves WHERE group_id = '${ids.group}'`)).rows[0].count, 2);
  await assert.rejects(
    move(ids.currentMove, ids.fieldB, '2026-11-10'),
    error => error.code === '23505',
  );
  await assert.rejects(
    move('10000000-0000-4000-8000-000000000033', ids.otherField, '2026-11-10', null, ids.otherFarm, ids.otherGroup),
    error => error.code === '42501',
  );
  await assert.rejects(
    db.query(`INSERT INTO public.cattle_moves (farm_id, group_id, moved_on, head_count)
      VALUES ($1,$2,$3,$4)`, [ids.farm, ids.group, '2026-11-11', 20]),
    error => error.code === '42501',
  );

  const event = (eventId, type, date, delta, reason = null, notes = null, farmId = ids.farm, groupId = ids.group) => db.query(
    'SELECT public.log_cattle_event($1,$2,$3,$4,$5,$6,$7,$8) AS value',
    [farmId, eventId, groupId, type, date, delta, reason, notes],
  );

  const added = await event(ids.addedEvent, 'head_added', '2026-11-02', 5);
  assert.equal(added.rows[0].value.head_count, 25);
  assert.equal(added.rows[0].value.already_applied, false);
  const repeatedAdded = await event(ids.addedEvent, 'head_added', '2026-11-02', 5);
  assert.equal(repeatedAdded.rows[0].value.already_applied, true, 'event replay is idempotent');
  assert.equal(repeatedAdded.rows[0].value.head_count, 25);

  const death = await event(ids.deathEvent, 'death', '2026-11-03', -3);
  assert.equal(death.rows[0].value.head_count, 22);
  await assert.rejects(
    event(ids.tooManyRemovedEvent, 'head_removed', '2026-11-04', -100, 'shipped'),
    error => error.code === '23514',
  );
  assert.equal((await db.query(`SELECT head_count FROM public.cattle_groups WHERE id = '${ids.group}'`)).rows[0].head_count, 22);
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.cattle_events WHERE id = '${ids.tooManyRemovedEvent}'`)).rows[0].count, 0);
  await assert.rejects(
    event('10000000-0000-4000-8000-000000000044', 'working', '2026-11-04', 1),
    error => error.code === '23514',
  );

  const deleteDeath = await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'event', ids.deathEvent],
  );
  assert.equal(deleteDeath.rows[0].value.head_count, 25, 'deleting an event reverses its delta');
  assert.equal(deleteDeath.rows[0].value.already_applied, false);
  const replayDeleteDeath = await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'event', ids.deathEvent],
  );
  assert.equal(replayDeleteDeath.rows[0].value.already_applied, true, 'event delete replay is idempotent');
  assert.equal((await db.query(`SELECT head_count FROM public.cattle_groups WHERE id = '${ids.group}'`)).rows[0].head_count, 25);

  const deleteCurrentMove = await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'move', ids.currentMove],
  );
  assert.equal(deleteCurrentMove.rows[0].value.already_applied, false);
  const fallbackPasture = (
    await db.query(`SELECT current_field_id, current_since FROM public.cattle_groups WHERE id = '${ids.group}'`)
  ).rows[0];
  assert.equal(fallbackPasture.current_field_id, ids.fieldB, 'deleting the current move restores the latest remaining pasture');
  assert.equal(fallbackPasture.current_since.toISOString().slice(0, 10), '2026-11-01');
  assert.equal((await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'move', ids.currentMove],
  )).rows[0].value.already_applied, true, 'move delete replay is idempotent');

  const offFarmMove = await move(ids.offFarmMove, null, '2026-11-11');
  assert.equal(offFarmMove.rows[0].value.current_updated, true);
  const offFarmState = (
    await db.query(`SELECT current_field_id, current_since FROM public.cattle_groups WHERE id = '${ids.group}'`)
  ).rows[0];
  assert.equal(offFarmState.current_field_id, null, 'an off-farm or drylot move clears the current field');
  assert.equal(offFarmState.current_since.toISOString().slice(0, 10), '2026-11-11');

  await move(ids.cascadeMove, ids.fieldA, '2026-11-05', null, ids.farm, ids.cascadeGroup);
  await event(ids.cascadeEvent, 'working', '2026-11-05', 0, null, null, ids.farm, ids.cascadeGroup);
  const deleteGroup = await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'group', ids.cascadeGroup],
  );
  assert.deepEqual(
    {
      moves: deleteGroup.rows[0].value.moves,
      events: deleteGroup.rows[0].value.events,
      alreadyApplied: deleteGroup.rows[0].value.already_applied,
    },
    { moves: 1, events: 1, alreadyApplied: false },
  );
  assert.equal((await db.query(
    'SELECT public.soft_delete_cattle_row($1,$2,$3) AS value',
    [ids.farm, 'group', ids.cascadeGroup],
  )).rows[0].value.already_applied, true, 'group delete replay is idempotent');
  await db.exec('RESET ROLE');
  assert.deepEqual((await db.query(`
    SELECT
      (SELECT deleted_at IS NOT NULL FROM public.cattle_groups WHERE id = '${ids.cascadeGroup}') AS cattle_group,
      (SELECT deleted_at IS NOT NULL FROM public.cattle_moves WHERE id = '${ids.cascadeMove}') AS cattle_move,
      (SELECT deleted_at IS NOT NULL FROM public.cattle_events WHERE id = '${ids.cascadeEvent}') AS cattle_event
  `)).rows[0], { cattle_group: true, cattle_move: true, cattle_event: true });
  await db.exec('SET ROLE authenticated');

  const restoreResult = await db.query(
    'SELECT public.restore_farm_backup($1::jsonb, NULL) AS value',
    [JSON.stringify({
      cattle_groups: [{
        id: ids.cascadeGroup, farm_id: ids.farm, name: 'Fall Calves', class: 'calves', head_count: 6,
        current_field_id: ids.fieldA, current_since: '2026-11-05', notes: null,
        created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-05T00:00:00Z', deleted_at: null,
      }],
      cattle_moves: [{
        id: ids.cascadeMove, farm_id: ids.farm, group_id: ids.cascadeGroup, field_id: ids.fieldA,
        moved_on: '2026-11-05', head_count: 6, notes: null,
        created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z', deleted_at: null,
      }],
      cattle_events: [{
        id: ids.cascadeEvent, farm_id: ids.farm, group_id: ids.cascadeGroup, event_type: 'working',
        event_date: '2026-11-05', head_delta: 0, reason: null, notes: null,
        created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z', deleted_at: null,
      }],
    })],
  );
  assert.deepEqual(
    {
      groups: restoreResult.rows[0].value.cattle_groups,
      moves: restoreResult.rows[0].value.cattle_moves,
      events: restoreResult.rows[0].value.cattle_events,
    },
    { groups: 1, moves: 1, events: 1 },
    'backup restore replays all cattle tables',
  );
  assert.equal((await db.query(`SELECT deleted_at FROM public.cattle_groups WHERE id = '${ids.cascadeGroup}'`)).rows[0].deleted_at, null);

  await db.exec('RESET ROLE');
  const cascadeRows = (
    await db.query(`
      SELECT
        (SELECT deleted_at IS NOT NULL FROM public.cattle_groups WHERE id = '${ids.cascadeGroup}') AS cattle_group,
        (SELECT deleted_at IS NOT NULL FROM public.cattle_moves WHERE id = '${ids.cascadeMove}') AS cattle_move,
        (SELECT deleted_at IS NOT NULL FROM public.cattle_events WHERE id = '${ids.cascadeEvent}') AS cattle_event
    `)
  ).rows[0];
  assert.deepEqual(cascadeRows, { cattle_group: false, cattle_move: false, cattle_event: false });

  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.cattle_groups WHERE id = '${ids.cascadeGroup}'`)).rows[0].count, 1, 'restored cattle rows are visible again');
  await assert.rejects(
    db.query('SELECT public.soft_delete_cattle_row($1,$2,$3)', [ids.otherFarm, 'group', ids.otherGroup]),
    error => error.code === '42501',
  );
  await db.exec('RESET ROLE');

  const privileges = (
    await db.query(`
      SELECT
        has_table_privilege('anon', 'public.cattle_groups', 'SELECT') AS anon_select,
        has_table_privilege('authenticated', 'public.cattle_groups', 'DELETE') AS auth_delete,
        has_function_privilege('anon', 'public.move_cattle_group(uuid,uuid,uuid,uuid,date,text)', 'EXECUTE') AS anon_move,
        has_function_privilege('authenticated', 'public.move_cattle_group(uuid,uuid,uuid,uuid,date,text)', 'EXECUTE') AS auth_move
    `)
  ).rows[0];
  assert.deepEqual(privileges, {
    anon_select: false,
    auth_delete: false,
    anon_move: false,
    auth_move: true,
  });

  console.log('Cattle migration checks passed: defaults, RLS, tenant isolation, back-dated moves, head-count floor, RPC replay, event reversal, and cascade soft delete.');
} finally {
  await db.close();
}
