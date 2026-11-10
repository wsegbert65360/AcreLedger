import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable PGlite: free farms can undo the latest pre-season reset.
// The restore body is a stub. Paid-table guards are the real ones, so a free
// undo that forgets to drop Pro tables fails closed instead of rewriting them.
const db = new PGlite();
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freeFarm = uid(1);
const paidFarm = uid(2);
const otherFarm = uid(3);
const freeUser = uid(4);
const paidUser = uid(5);
const otherUser = uid(6);
const fieldId = uid(10);
const binId = uid(11);
const harvestId = uid(13);
const equipId = uid(14);
const paidBinId = uid(15);
const plantId = uid(16);
const mig = (f) => readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');

const svc = async (sql) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role; ${sql}; RESET ROLE`);
};
const as = (user) => db.exec(`RESET ROLE; SELECT set_config('request.uid', '${user}', false); SET ROLE authenticated`);
const qsvc = async (sql) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.uid', '', false); SET ROLE service_role`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('RESET ROLE');
  }
};
const seasonOf = async (user) => (await qsvc(`SELECT active_season FROM public.profiles WHERE id = '${user}'`)).rows[0].active_season;
const setSeason = (user, year) => svc(`UPDATE public.profiles SET active_season = ${year} WHERE id = '${user}'`);

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role, anon;
    CREATE TABLE public.farms (id uuid PRIMARY KEY, trial_ends_at timestamptz);
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      farm_id uuid REFERENCES public.farms,
      active_season integer
    );
    CREATE TABLE public.farm_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_id uuid NOT NULL REFERENCES public.farms,
      status text NOT NULL,
      current_period_end timestamptz,
      deleted_at timestamptz
    );
    CREATE TABLE public.farm_comps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_id uuid NOT NULL REFERENCES public.farms,
      reason text NOT NULL,
      expires_at timestamptz,
      deleted_at timestamptz
    );
    CREATE TABLE public.bins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TABLE public.grain_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, bushels numeric, deleted_at timestamptz);
    CREATE TABLE public.equipment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TABLE public.maintenance_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, note text, deleted_at timestamptz);
    CREATE TABLE public.maintenance_schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, note text, deleted_at timestamptz);
    CREATE TABLE public.field_clu_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, clu text, deleted_at timestamptz);
    CREATE TABLE public.fsa_tract_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL, tract text, deleted_at timestamptz);
    CREATE TABLE public.harvest_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_id uuid NOT NULL,
      destination text NOT NULL,
      bin_id uuid,
      bushels numeric,
      deleted_at timestamptz
    );
    CREATE TABLE public.fields (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_id uuid NOT NULL,
      name text,
      fsa_farm_number text,
      fsa_tract_number text,
      fsa_field_number text,
      clu_numbers jsonb,
      landlord_name text,
      producer_share numeric,
      deleted_at timestamptz
    );
    CREATE TABLE public.plant_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_id uuid NOT NULL,
      note text,
      deleted_at timestamptz
    );
    -- Renamed to _restore_farm_backup_impl by the paid-feature guards migration.
    CREATE FUNCTION public.restore_farm_backup(p_payload jsonb, p_active_season integer DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      item jsonb;
      tbl text;
      v_farm uuid;
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
      END IF;
      SELECT farm_id INTO v_farm FROM public.profiles WHERE id = auth.uid();

      IF jsonb_typeof(p_payload->'fields') = 'array' THEN
        FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'fields') AS t(value) LOOP
          -- Same shape as _restore_table_for_farm: only JSON keys are written,
          -- and BEFORE INSERT runs before ON CONFLICT.
          IF item ? 'landlord_name' THEN
            INSERT INTO public.fields (id, farm_id, name, landlord_name)
            VALUES ((item->>'id')::uuid, v_farm, item->>'name', item->>'landlord_name')
            ON CONFLICT (id) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, public.fields.name),
              landlord_name = EXCLUDED.landlord_name;
          ELSE
            INSERT INTO public.fields (id, farm_id, name)
            VALUES ((item->>'id')::uuid, v_farm, item->>'name')
            ON CONFLICT (id) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, public.fields.name);
          END IF;
        END LOOP;
      END IF;

      IF jsonb_typeof(p_payload->'harvest_records') = 'array' THEN
        FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'harvest_records') AS t(value) LOOP
          INSERT INTO public.harvest_records (id, farm_id, destination, bin_id)
          VALUES (
            (item->>'id')::uuid,
            v_farm,
            COALESCE(item->>'destination', 'elevator'),
            CASE WHEN item ? 'bin_id' THEN NULLIF(item->>'bin_id', '')::uuid ELSE NULL END
          )
          ON CONFLICT (id) DO UPDATE SET
            destination = CASE WHEN item ? 'destination' THEN EXCLUDED.destination ELSE public.harvest_records.destination END,
            bin_id = CASE WHEN item ? 'bin_id' THEN EXCLUDED.bin_id ELSE public.harvest_records.bin_id END;
        END LOOP;
      END IF;

      IF jsonb_typeof(p_payload->'bins') = 'array' THEN
        FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'bins') AS t(value) LOOP
          UPDATE public.bins
          SET name = COALESCE(item->>'name', name)
          WHERE id = (item->>'id')::uuid AND farm_id = v_farm;
        END LOOP;
      END IF;

      IF jsonb_typeof(p_payload->'equipment') = 'array' THEN
        FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'equipment') AS t(value) LOOP
          INSERT INTO public.equipment (id, farm_id, name)
          VALUES ((item->>'id')::uuid, v_farm, COALESCE(item->>'name', 'x'))
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
        END LOOP;
      END IF;

      IF COALESCE(p_payload->>'_pre_season_reset', '') = 'true' THEN
        FOR tbl IN
          SELECT jsonb_array_elements_text(COALESCE(p_payload->'_rollback_tables', '[]'::jsonb))
        LOOP
          IF tbl = 'plant_records' THEN
            UPDATE public.plant_records SET deleted_at = now()
            WHERE farm_id = v_farm AND deleted_at IS NULL
              AND id NOT IN (
                SELECT (e->>'id')::uuid
                FROM jsonb_array_elements(COALESCE(p_payload->'plant_records', '[]'::jsonb)) e
                WHERE e->>'id' IS NOT NULL
              );
          ELSIF tbl = 'fields' THEN
            UPDATE public.fields SET deleted_at = now()
            WHERE farm_id = v_farm AND deleted_at IS NULL
              AND id NOT IN (
                SELECT (e->>'id')::uuid
                FROM jsonb_array_elements(COALESCE(p_payload->'fields', '[]'::jsonb)) e
                WHERE e->>'id' IS NOT NULL
              );
          ELSIF tbl = 'harvest_records' THEN
            UPDATE public.harvest_records SET deleted_at = now()
            WHERE farm_id = v_farm AND deleted_at IS NULL
              AND id NOT IN (
                SELECT (e->>'id')::uuid
                FROM jsonb_array_elements(COALESCE(p_payload->'harvest_records', '[]'::jsonb)) e
                WHERE e->>'id' IS NOT NULL
              );
          END IF;
        END LOOP;
      END IF;

      IF p_active_season IS NOT NULL THEN
        UPDATE public.profiles
        SET active_season = p_active_season
        WHERE id = auth.uid()
          AND (
            NULLIF(p_payload->>'_expected_active_season', '') IS NULL
            OR active_season = (p_payload->>'_expected_active_season')::integer
          );
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Active season changed elsewhere' USING ERRCODE = '22023';
        END IF;
      END IF;

      RETURN jsonb_build_object('active_season', p_active_season, 'restored', true);
    END;
    $fn$;
    GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;
    INSERT INTO public.farms (id) VALUES ('${freeFarm}'), ('${paidFarm}'), ('${otherFarm}');
    INSERT INTO public.profiles (id, farm_id, active_season) VALUES
      ('${freeUser}', '${freeFarm}', 2025),
      ('${paidUser}', '${paidFarm}', 2025),
      ('${otherUser}', '${otherFarm}', 2025);
    INSERT INTO public.farm_subscriptions (farm_id, status) VALUES ('${paidFarm}', 'active');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
  `);

  await db.exec(await mig('20261107000000_entitlements_core.sql'));
  await db.exec(await mig('20261107050000_paid_feature_guards.sql'));
  const undoSql = await mig('20261110180000_pre_season_reset_undo.sql');
  await db.exec(undoSql);
  await db.exec(undoSql);
  await svc(`UPDATE public.entitlement_config SET mode = 'enforce'`);

  await as(otherUser);
  await assert.rejects(
    db.query(`SELECT public.start_pre_season_reset(2025, 2027)`),
    /exactly one year/,
  );
  assert.equal(await seasonOf(otherUser), 2025);
  await setSeason(otherUser, 2024);
  await as(otherUser);
  await assert.rejects(
    db.query(`SELECT public.start_pre_season_reset(2025, 2026)`),
    /Active season changed elsewhere/,
  );
  assert.equal(await seasonOf(otherUser), 2024);
  await setSeason(otherUser, 2025);

  await svc(`
    INSERT INTO public.fields (id, farm_id, name, landlord_name, producer_share)
    VALUES ('${fieldId}', '${freeFarm}', 'Before', 'BeforeLandlord', 60);
    INSERT INTO public.bins (id, farm_id, name) VALUES ('${binId}', '${freeFarm}', 'OriginalBin');
    INSERT INTO public.harvest_records (id, farm_id, destination, bushels)
    VALUES ('${harvestId}', '${freeFarm}', 'elevator', 10);
  `);

  await as(freeUser);
  const started = await db.query(`SELECT public.start_pre_season_reset(2025, 2026) AS id`);
  const snapshotId = started.rows[0].id;
  assert.match(snapshotId, /^[0-9a-f-]{36}$/i);
  assert.equal(await seasonOf(freeUser), 2026);

  const stored = await qsvc(`SELECT payload FROM public.pre_season_reset_snapshots WHERE id = '${snapshotId}'`);
  const payload = stored.rows[0].payload;
  assert.equal(payload.fields[0].name, 'Before');
  assert.equal(payload.bins[0].name, 'OriginalBin');
  assert.equal(payload.equipment.length, 0);

  await as(freeUser);
  await db.query(`UPDATE public.fields SET name = 'Renamed' WHERE id = '${fieldId}'`);
  await db.query(`INSERT INTO public.plant_records (id, farm_id, note) VALUES ('${plantId}', '${freeFarm}', 'after')`);
  await svc(`
    UPDATE public.bins SET name = 'ChangedBin' WHERE id = '${binId}';
    UPDATE public.fields SET landlord_name = 'AfterLandlord' WHERE id = '${fieldId}';
    UPDATE public.harvest_records
    SET destination = 'bin', bin_id = '${binId}'
    WHERE id = '${harvestId}';
    UPDATE public.pre_season_reset_snapshots
    SET payload = payload || jsonb_build_object(
      'equipment', jsonb_build_array(jsonb_build_object('id', '${equipId}', 'name', 'sneaky'))
    )
    WHERE id = '${snapshotId}';
  `);

  await as(otherUser);
  await assert.rejects(
    db.query(`SELECT public.undo_pre_season_reset('${snapshotId}')`),
    /not found/,
  );
  assert.equal(await seasonOf(otherUser), 2025);
  assert.equal(await seasonOf(freeUser), 2026);

  await as(freeUser);
  const undone = await db.query(`SELECT public.undo_pre_season_reset('${snapshotId}') AS result`);
  assert.equal(undone.rows[0].result.active_season, 2025);
  assert.equal(await seasonOf(freeUser), 2025);

  const field = (await qsvc(`SELECT name, landlord_name FROM public.fields WHERE id = '${fieldId}'`)).rows[0];
  assert.equal(field.name, 'Before');
  assert.equal(field.landlord_name, 'AfterLandlord');
  const bin = (await qsvc(`SELECT name FROM public.bins WHERE id = '${binId}'`)).rows[0];
  assert.equal(bin.name, 'ChangedBin');
  const harvest = (await qsvc(`SELECT destination, bin_id::text AS bin_id FROM public.harvest_records WHERE id = '${harvestId}'`)).rows[0];
  assert.equal(harvest.destination, 'bin');
  assert.equal(harvest.bin_id, binId);
  const plant = (await qsvc(`SELECT deleted_at IS NOT NULL AS hidden FROM public.plant_records WHERE id = '${plantId}'`)).rows[0];
  assert.equal(plant.hidden, true);
  const equipmentCount = (await qsvc(`SELECT count(*)::int AS n FROM public.equipment WHERE farm_id = '${freeFarm}'`)).rows[0].n;
  assert.equal(equipmentCount, 0);
  const snap = (await qsvc(`
    SELECT undone_at IS NOT NULL AS undone,
           jsonb_typeof(payload->'bins') AS bins,
           jsonb_array_length(payload->'equipment') AS sneaky
    FROM public.pre_season_reset_snapshots WHERE id = '${snapshotId}'
  `)).rows[0];
  assert.equal(snap.undone, true);
  assert.equal(snap.bins, 'array');
  assert.equal(snap.sneaky, 1);

  await as(freeUser);
  await assert.rejects(
    db.query(`SELECT public.undo_pre_season_reset('${snapshotId}')`),
    /already undone/,
  );
  await assert.rejects(
    db.query(`SELECT public.restore_farm_backup('{}'::jsonb)`),
    (error) => error.code === 'P0402' && error.message.includes('premium_required:backup_restore'),
  );
  await assert.rejects(
    db.query(`SELECT public._restore_farm_backup_impl('{}'::jsonb, NULL)`),
    /permission denied/,
  );

  await as(freeUser);
  const older = (await db.query(`SELECT public.start_pre_season_reset(2025, 2026) AS id`)).rows[0].id;
  await db.query(`SELECT pg_sleep(0.02)`);
  const latest = (await db.query(`SELECT public.start_pre_season_reset(2026, 2027) AS id`)).rows[0].id;
  await assert.rejects(
    db.query(`SELECT public.undo_pre_season_reset('${older}')`),
    /Only the latest/,
  );
  await db.query(`SELECT public.undo_pre_season_reset('${latest}')`);
  assert.equal(await seasonOf(freeUser), 2026);
  await as(freeUser);
  await assert.rejects(
    db.query(`SELECT public.undo_pre_season_reset('${older}')`),
    /Only the latest/,
  );

  const aged = (await db.query(`SELECT public.start_pre_season_reset(2026, 2027) AS id`)).rows[0].id;
  await svc(`
    UPDATE public.pre_season_reset_snapshots
    SET deleted_at = now()
    WHERE farm_id = '${freeFarm}' AND id <> '${aged}' AND deleted_at IS NULL;
    UPDATE public.pre_season_reset_snapshots
    SET created_at = now() - interval '31 days'
    WHERE id = '${aged}';
  `);
  await as(freeUser);
  await assert.rejects(
    db.query(`SELECT public.undo_pre_season_reset('${aged}')`),
    /older than 30 days/,
  );
  await svc(`UPDATE public.pre_season_reset_snapshots SET created_at = now() - interval '1 day' WHERE id = '${aged}'`);
  await as(freeUser);
  await db.query(`SELECT public.undo_pre_season_reset('${aged}')`);
  assert.equal(await seasonOf(freeUser), 2026);

  await svc(`
    UPDATE public.pre_season_reset_snapshots SET deleted_at = now()
    WHERE farm_id = '${freeFarm}' AND deleted_at IS NULL;
  `);
  await setSeason(freeUser, 2023);
  await as(freeUser);
  for (const year of [2023, 2024, 2025, 2026]) {
    await db.query(`SELECT public.start_pre_season_reset(${year}, ${year + 1})`);
    await db.query(`SELECT pg_sleep(0.02)`);
  }
  const kept = await qsvc(`
    SELECT
      count(*) FILTER (WHERE deleted_at IS NULL)::int AS live,
      count(*) FILTER (WHERE from_season = 2023 AND deleted_at IS NOT NULL)::int AS pruned
    FROM public.pre_season_reset_snapshots
    WHERE farm_id = '${freeFarm}'
  `);
  assert.equal(kept.rows[0].live, 3);
  assert.equal(kept.rows[0].pruned, 1);
  const stillThere = (await qsvc(`SELECT count(*)::int AS n FROM public.pre_season_reset_snapshots WHERE farm_id = '${freeFarm}' AND from_season = 2023`)).rows[0].n;
  assert.equal(stillThere, 1);

  await as(paidUser);
  await db.query(`INSERT INTO public.bins (id, farm_id, name) VALUES ('${paidBinId}', '${paidFarm}', 'Snap')`);
  await db.query(`SELECT public.start_pre_season_reset(2025, 2026)`);
  await svc(`UPDATE public.bins SET name = 'Edited' WHERE id = '${paidBinId}'`);
  const paidSnap = (await qsvc(`
    SELECT id FROM public.pre_season_reset_snapshots
    WHERE farm_id = '${paidFarm}' AND deleted_at IS NULL AND undone_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `)).rows[0].id;
  await as(paidUser);
  await db.query(`SELECT public.undo_pre_season_reset('${paidSnap}')`);
  const paidBin = (await qsvc(`SELECT name FROM public.bins WHERE id = '${paidBinId}'`)).rows[0];
  assert.equal(paidBin.name, 'Snap');
  assert.equal(await seasonOf(paidUser), 2025);

  await as(freeUser);
  for (const statement of [
    `SELECT * FROM public.pre_season_reset_snapshots`,
    `INSERT INTO public.pre_season_reset_snapshots (farm_id, from_season, to_season, payload) VALUES ('${freeFarm}', 2025, 2026, '{}')`,
    `UPDATE public.pre_season_reset_snapshots SET undone_at = now()`,
    `DELETE FROM public.pre_season_reset_snapshots`,
    `SELECT public._pre_season_snapshot_tables()`,
    `SELECT public._pre_season_snapshot_rows('fields', '${freeFarm}')`,
    `SELECT public._pre_season_rollback_tables('{}'::jsonb)`,
    `SELECT public._pre_season_payload_for_undo('{}'::jsonb, '${freeFarm}')`,
  ]) {
    await assert.rejects(db.query(statement), /permission denied/, statement);
  }

  await db.exec(`RESET ROLE; SET ROLE anon`);
  await assert.rejects(db.query(`SELECT public.start_pre_season_reset(2025, 2026)`), /permission denied/);
  await assert.rejects(db.query(`SELECT public.undo_pre_season_reset('${snapshotId}')`), /permission denied/);
  await assert.rejects(db.query(`SELECT * FROM public.pre_season_reset_snapshots`), /permission denied/);

  console.log('Pre-season reset undo: free undo, Pro restore still blocked, snapshot guards passed.');
} finally {
  await db.close();
}
