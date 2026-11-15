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

const fixesMigration = await readFile(
  new URL('../supabase/migrations/20261114140000_cattle_db_fixes.sql', import.meta.url),
  'utf8',
);

const renameMigration = await readFile(
  new URL('../supabase/migrations/20261114150000_cattle_restore_rename_conflicts.sql', import.meta.url),
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
  await db.exec(fixesMigration);
  await db.exec(renameMigration);

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

  // ---- 20261114140000_cattle_db_fixes ----
  const fx = {
    gA: '10000000-0000-4000-8000-000000000061',
    gB: '10000000-0000-4000-8000-000000000062',
    gC: '10000000-0000-4000-8000-000000000063',
    otherFarmGroup: ids.otherGroup,
  };
  const n = i => `10000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
  // Use the database's own current_date: PGlite runs in the host time zone.
  const dbToday = (await db.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS d")).rows[0].d;
  const plusDays = d => new Date(Date.parse(`${dbToday}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
  await db.exec(`
    INSERT INTO public.cattle_groups (id, farm_id, name, class, head_count) VALUES
      ('${fx.gA}', '${ids.farm}', 'Fix A', 'cows', 10),
      ('${fx.gB}', '${ids.farm}', 'Fix B', 'calves', 3),
      ('${fx.gC}', '${ids.farm}', 'Fix C', 'stockers', 4);
    SELECT set_config('request.uid', '${ids.user}', false);
    SET ROLE authenticated;
  `);
  const headOf = async id => (await db.query('SELECT head_count FROM public.cattle_groups WHERE id = $1', [id])).rows[0].head_count;
  const ev = (eventId, type, date, delta, reason, notes, groupId = fx.gA) => event(eventId, type, date, delta, reason, notes, ids.farm, groupId);

  // a. head_removed must carry a valid reason (RPC and table CHECK).
  for (const [i, reason] of [[1, null], [2, ''], [3, '   '], [4, 'sold']]) {
    await assert.rejects(ev(n(i), 'head_removed', '2026-11-04', -1, reason), error => error.code === '23514', `head_removed with reason ${JSON.stringify(reason)} is refused`);
  }
  assert.equal(await headOf(fx.gA), 10, 'refused removals change nothing');
  const shipped = await ev(n(5), 'head_removed', '2026-11-04', -1, 'shipped');
  assert.equal(shipped.rows[0].value.head_count, 9);
  const moved = await ev(n(6), 'head_removed', '2026-11-04', -1, 'moved_to_another_group');
  assert.equal(moved.rows[0].value.head_count, 8);
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('acreledger.cattle_rpc', 'on', false)`);
  await assert.rejects(
    db.query(`INSERT INTO public.cattle_events (farm_id, group_id, event_type, event_date, head_delta, reason)
      VALUES ('${ids.farm}', '${fx.gA}', 'head_removed', '2026-11-04', -1, NULL)`),
    error => error.code === '23514', 'table CHECK refuses a NULL removal reason',
  );
  // b. 'died' is not a reason any more, in the RPC or the CHECK.
  await assert.rejects(
    db.query(`INSERT INTO public.cattle_events (farm_id, group_id, event_type, event_date, head_delta, reason)
      VALUES ('${ids.farm}', '${fx.gA}', 'head_removed', '2026-11-04', -1, 'died')`),
    error => error.code === '23514', "table CHECK refuses 'died'",
  );
  await db.exec(`SELECT set_config('acreledger.cattle_rpc', 'off', false)`);
  await db.exec(`SELECT set_config('request.uid', '${ids.user}', false); SET ROLE authenticated;`);
  await assert.rejects(ev(n(7), 'head_removed', '2026-11-04', -1, 'died'), error => error.code === '23514', "RPC refuses 'died'");
  const death2 = await ev(n(8), 'death', '2026-11-04', -1, null);
  assert.equal(death2.rows[0].value.head_count, 7, 'a death is logged with the death event');

  // c. Dates: UTC today + 1 is allowed (farmers ahead of UTC); +2 is not.
  const tomorrow = plusDays(1);
  const dayAfter = plusDays(2);
  assert.equal((await move(n(10), ids.fieldA, tomorrow, null, ids.farm, fx.gA)).rows[0].value.already_applied, false, 'move dated UTC+1 day is accepted');
  await assert.rejects(move(n(11), ids.fieldA, dayAfter, null, ids.farm, fx.gA), error => error.code === '23514', 'move two days ahead is refused');
  assert.equal((await ev(n(12), 'working', tomorrow, 0, null, null)).rows[0].value.already_applied, false, 'event dated UTC+1 day is accepted');
  await assert.rejects(ev(n(13), 'working', dayAfter, 0, null, null), error => error.code === '23514', 'event two days ahead is refused');

  // d. Text is normalised before insert and before the replay comparison.
  const blankNotes = await move(n(14), ids.fieldB, '2026-11-12', '', ids.farm, fx.gB);
  assert.equal(blankNotes.rows[0].value.already_applied, false);
  assert.equal((await db.query('SELECT notes FROM public.cattle_moves WHERE id = $1', [n(14)])).rows[0].notes, null, "'' is stored as NULL");
  assert.equal((await move(n(14), ids.fieldB, '2026-11-12', null, ids.farm, fx.gB)).rows[0].value.already_applied, true, "replay with NULL after '' is already_applied");
  assert.equal((await move(n(14), ids.fieldB, '2026-11-12', '   ', ids.farm, fx.gB)).rows[0].value.already_applied, true, 'replay with whitespace is already_applied');
  await move(n(15), ids.fieldB, '2026-11-13', '  rotated  ', ids.farm, fx.gB);
  assert.equal((await db.query('SELECT notes FROM public.cattle_moves WHERE id = $1', [n(15)])).rows[0].notes, 'rotated', 'notes are trimmed');
  assert.equal((await move(n(15), ids.fieldB, '2026-11-13', 'rotated', ids.farm, fx.gB)).rows[0].value.already_applied, true);
  await assert.rejects(move(n(15), ids.fieldB, '2026-11-13', 'different', ids.farm, fx.gB), error => error.code === '23505', 'a genuinely different replay still conflicts');
  await ev(n(16), 'calving', '2026-11-05', 2, '', '', fx.gB);
  const calvingRow = (await db.query('SELECT reason, notes FROM public.cattle_events WHERE id = $1', [n(16)])).rows[0];
  assert.deepEqual(calvingRow, { reason: null, notes: null }, 'event reason and notes are normalised');
  assert.equal((await ev(n(16), 'calving', '2026-11-05', 2, null, null, fx.gB)).rows[0].value.already_applied, true, "event replay with NULL after '' is already_applied");
  assert.equal(await headOf(fx.gB), 5);

  // e. Deleting an event floors the reversed head count at zero; it never refuses.
  await ev(n(17), 'head_added', '2026-11-06', 5, null, null, fx.gC);
  assert.equal(await headOf(fx.gC), 9);
  await db.query('UPDATE public.cattle_groups SET head_count = 2 WHERE id = $1', [fx.gC]);
  const floored = await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3) AS value', [ids.farm, 'event', n(17)]);
  assert.equal(floored.rows[0].value.head_count, 0, 'reversing +5 on a group edited down to 2 floors at 0');
  assert.equal(await headOf(fx.gC), 0);
  await db.query('UPDATE public.cattle_groups SET head_count = 4 WHERE id = $1', [fx.gC]);

  // f. transfer_cattle_head
  const xfer = (fromEv, toEv, from, to, head, date = '2026-11-08', notes = null, farmId = ids.farm) => db.query(
    'SELECT public.transfer_cattle_head($1,$2,$3,$4,$5,$6,$7,$8) AS value',
    [farmId, fromEv, toEv, from, to, head, date, notes],
  );
  assert.equal(await headOf(fx.gA), 7);
  assert.equal(await headOf(fx.gB), 5);
  const t1 = await xfer(n(20), n(21), fx.gA, fx.gB, 4, '2026-11-08', 'weaned');
  assert.equal(t1.rows[0].value.already_applied, false);
  assert.equal(t1.rows[0].value.from_head_count, 3);
  assert.equal(t1.rows[0].value.to_head_count, 9);
  assert.equal(await headOf(fx.gA), 3);
  assert.equal(await headOf(fx.gB), 9);
  const halves = (await db.query('SELECT id, group_id, event_type, head_delta, reason, notes, transfer_id FROM public.cattle_events WHERE transfer_id = $1 ORDER BY head_delta', [n(20)])).rows;
  assert.deepEqual(halves, [
    { id: n(20), group_id: fx.gA, event_type: 'head_removed', head_delta: -4, reason: 'moved_to_another_group', notes: 'weaned', transfer_id: n(20) },
    { id: n(21), group_id: fx.gB, event_type: 'head_added', head_delta: 4, reason: null, notes: 'weaned', transfer_id: n(20) },
  ], 'one removal and one addition share a transfer_id');
  const t1Replay = await xfer(n(20), n(21), fx.gA, fx.gB, 4, '2026-11-08', ' weaned ');
  assert.equal(t1Replay.rows[0].value.already_applied, true, 'transfer replay is idempotent');
  assert.equal(await headOf(fx.gA), 3);
  assert.equal(await headOf(fx.gB), 9);
  await assert.rejects(xfer(n(20), n(21), fx.gA, fx.gB, 2, '2026-11-08', 'weaned'), error => error.code === '23505', 'same ids with different head conflict');
  await assert.rejects(xfer(n(22), n(21), fx.gA, fx.gB, 4, '2026-11-08', 'weaned'), error => error.code === '23505', 'a reused to-id conflicts');
  await assert.rejects(xfer(n(20), n(23), fx.gA, fx.gB, 4, '2026-11-08', 'weaned'), error => error.code === '23505', 'a reused from-id conflicts');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.gB, 99), error => error.code === '23514', 'transfer cannot exceed the source count');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_events WHERE id IN ($1,$2)', [n(24), n(25)])).rows[0].c, 0, 'a refused transfer leaves no rows');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.gA, 1), error => error.code === '23514', 'transfer needs two different groups');
  await assert.rejects(xfer(n(26), n(26), fx.gA, fx.gB, 1), error => error.code === '23514', 'transfer needs two different event ids');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.gB, 0), error => error.code === '23514', 'transfer head must be positive');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.gB, 1, plusDays(2)), error => error.code === '23514', 'transfer date two days ahead is refused');
  assert.equal((await xfer(n(27), n(28), fx.gA, fx.gB, 1, plusDays(1))).rows[0].value.already_applied, false, 'transfer dated UTC+1 day is accepted');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.otherFarmGroup, 1), error => error.code === 'P0002', 'a group from another farm is not found');
  await assert.rejects(xfer(n(24), n(25), fx.gA, fx.gB, 1, '2026-11-08', null, ids.otherFarm), error => error.code === '42501', 'another farm id is denied');
  // opposite-direction transfer works (locks are taken in id order).
  const back = await xfer(n(29), n(30), fx.gB, fx.gA, 2);
  assert.equal(back.rows[0].value.already_applied, false);
  assert.equal(await headOf(fx.gA), 4);
  assert.equal(await headOf(fx.gB), 8);
  // A plain event RPC cannot replay a transfer half as an ordinary event.
  await assert.rejects(ev(n(20), 'head_removed', '2026-11-08', -4, 'moved_to_another_group', 'weaned'), error => error.code === '23505');

  // g. Deleting either half reverses both halves.
  const delFrom = await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3) AS value', [ids.farm, 'event', n(20)]);
  assert.equal(delFrom.rows[0].value.events, 2, 'deleting the from-half deletes both halves');
  assert.equal(await headOf(fx.gA), 8, 'source count restored (4 + 4)');
  assert.equal(await headOf(fx.gB), 4, 'destination count reversed (8 - 4)');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_events WHERE transfer_id = $1 AND deleted_at IS NULL', [n(20)])).rows[0].c, 0);
  assert.equal((await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3) AS value', [ids.farm, 'event', n(21)])).rows[0].value.already_applied, true, 'deleting the other half afterwards is a no-op');
  assert.equal(await headOf(fx.gA), 8);
  assert.equal(await headOf(fx.gB), 4);
  const delTo = await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3) AS value', [ids.farm, 'event', n(30)]);
  assert.equal(delTo.rows[0].value.events, 2, 'deleting the to-half deletes both halves');
  assert.equal(await headOf(fx.gA), 6, 'to-half delete reverses the source too (8 - 2)');
  assert.equal(await headOf(fx.gB), 6, 'and the destination (4 + 2)');
  // Floor: a transfer half deleted after the destination was edited below the delta.
  await xfer(n(31), n(32), fx.gA, fx.gB, 5);
  await db.query('UPDATE public.cattle_groups SET head_count = 1 WHERE id = $1', [fx.gB]);
  const delFloor = await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3) AS value', [ids.farm, 'event', n(31)]);
  assert.equal(delFloor.rows[0].value.events, 2);
  assert.equal(await headOf(fx.gB), 0, 'transfer delete floors the destination at zero');
  assert.equal(await headOf(fx.gA), 6, 'and still restores the source (1 + 5)');

  // ---- backup -> delete a group -> restore brings back the group, moves and events ----
  const backupRows = async table => (await db.query(
    `SELECT to_jsonb(t) AS row FROM public.${table} t WHERE farm_id = $1 AND (group_id = $2 OR id = $2) AND deleted_at IS NULL ORDER BY id`.replace('(group_id = $2 OR id = $2)', table === 'cattle_groups' ? 'id = $2' : 'group_id = $2'),
    [ids.farm, fx.gB],
  )).rows.map(r => r.row);
  await move(n(40), ids.fieldA, '2026-11-09', 'backup move', ids.farm, fx.gB);
  const backup = {
    cattle_groups: await backupRows('cattle_groups'),
    cattle_moves: await backupRows('cattle_moves'),
    cattle_events: await backupRows('cattle_events'),
  };
  assert.equal(backup.cattle_groups.length, 1);
  assert.ok(backup.cattle_moves.length >= 2 && backup.cattle_events.length >= 2, 'backup captured moves and events');
  assert.ok(backup.cattle_events.some(e => e.transfer_id), 'backup keeps transfer_id');
  const gBBefore = (await db.query('SELECT head_count, current_field_id FROM public.cattle_groups WHERE id = $1', [fx.gB])).rows[0];
  await db.query('SELECT public.soft_delete_cattle_row($1,$2,$3)', [ids.farm, 'group', fx.gB]);
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_groups WHERE id = $1', [fx.gB])).rows[0].c, 0, 'deleted group is hidden');
  const restored = await db.query('SELECT public.restore_farm_backup($1::jsonb, NULL) AS value', [JSON.stringify(backup)]);
  assert.equal(restored.rows[0].value.cattle_group_name_conflicts, 0);
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_groups WHERE id = $1', [fx.gB])).rows[0].c, 1, 'restore brings the group back');
  assert.deepEqual((await db.query('SELECT head_count, current_field_id FROM public.cattle_groups WHERE id = $1', [fx.gB])).rows[0], gBBefore, 'restored head count and pasture match the backup');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_moves WHERE group_id = $1', [fx.gB])).rows[0].c, backup.cattle_moves.length, 'restore brings back every move');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_events WHERE group_id = $1', [fx.gB])).rows[0].c, backup.cattle_events.length, 'restore brings back every event');
  assert.ok((await db.query('SELECT 1 FROM public.cattle_events WHERE group_id = $1 AND transfer_id IS NOT NULL', [fx.gB])).rows.length > 0, 'restored events keep transfer_id');

  // ---- a restored group whose name collides with a live group is renamed, never dropped ----
  const clash = { live: '10000000-0000-4000-8000-000000000071', back: '10000000-0000-4000-8000-000000000072', back2: '10000000-0000-4000-8000-000000000073' };
  await db.query('INSERT INTO public.cattle_groups (id, farm_id, name, class, head_count) VALUES ($1,$2,$3,$4,$5)', [clash.live, ids.farm, 'Heifers', 'replacement_heifers', 12]);
  await db.query('INSERT INTO public.cattle_groups (id, farm_id, name, class, head_count) VALUES ($1,$2,$3,$4,$5)', [clash.back2, ids.farm, 'Heifers (restored)', 'replacement_heifers', 1]);
  const groupPayload = (id, name) => ({ id, farm_id: ids.farm, name, class: 'replacement_heifers', head_count: 7, current_field_id: null, current_since: null, notes: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null });
  const collide = await db.query('SELECT public.restore_farm_backup($1::jsonb, NULL) AS value', [JSON.stringify({
    cattle_groups: [groupPayload(clash.back, 'heifers')],
    cattle_moves: [{ id: n(41), farm_id: ids.farm, group_id: clash.back, field_id: ids.fieldA, moved_on: '2026-11-02', head_count: 7, notes: null, created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', deleted_at: null }],
    cattle_events: [{ id: n(42), farm_id: ids.farm, group_id: clash.back, event_type: 'working', event_date: '2026-11-02', head_delta: 0, reason: null, notes: null, created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', deleted_at: null }],
  })]);
  assert.equal(collide.rows[0].value.cattle_group_name_conflicts, 1, 'the collision is reported, not fatal');
  const collided = (await db.query('SELECT name, deleted_at FROM public.cattle_groups WHERE id = $1', [clash.back])).rows[0];
  assert.equal(collided.deleted_at, null, 'the restored group is active, not a hidden tombstone');
  assert.equal(collided.name, 'heifers (restored 2)', "a taken suffix falls through to '(restored 2)'");
  assert.equal((await db.query('SELECT name FROM public.cattle_groups WHERE id = $1', [clash.live])).rows[0].name, 'Heifers', 'the live group keeps its name');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_moves WHERE group_id = $1 AND deleted_at IS NULL', [clash.back])).rows[0].c, 1, 'its moves restore');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM public.cattle_events WHERE group_id = $1 AND deleted_at IS NULL', [clash.back])).rows[0].c, 1, 'its events restore');
  // Restoring the same payload again is not a conflict with itself.
  const again = await db.query('SELECT public.restore_farm_backup($1::jsonb, NULL) AS value', [JSON.stringify({ cattle_groups: [{ ...groupPayload(clash.back, 'heifers (restored 2)') }] })]);
  assert.equal(again.rows[0].value.cattle_group_name_conflicts, 0);

  await db.exec('RESET ROLE');
  const fnProps = (await db.query(`
    SELECT p.prosecdef AS secdef, p.proconfig::text AS config,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
    FROM pg_proc p WHERE p.proname = 'transfer_cattle_head'
  `)).rows[0];
  assert.deepEqual(fnProps, { secdef: true, config: '{"search_path=\\"\\""}', anon_exec: false, auth_exec: true }, 'transfer_cattle_head is SECURITY DEFINER, empty search_path, explicit grants');

  console.log('Cattle migration checks passed: defaults, RLS, tenant isolation, back-dated moves, head-count floor, RPC replay, event reversal, cascade soft delete, required removal reasons, UTC date slack, text normalisation, floored event delete, and atomic transfers, backup/delete/restore, and renamed name collisions.');
} finally {
  await db.close();
}
