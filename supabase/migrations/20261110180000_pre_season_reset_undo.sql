-- Free farms can undo the latest pre-season reset. General backup restore stays Pro.
--
-- start_pre_season_reset snapshots the caller's farm on the server (the client
-- never supplies rows) and compare-and-sets profiles.active_season.
-- undo_pre_season_reset replays that snapshot through _restore_farm_backup_impl
-- with the pre-season rollback semantics. It does not call assert_premium, and
-- it does not replace restore_farm_backup, which still requires Pro.
--
-- Pro rows and a free plan in enforce mode:
-- guard_premium_table rejects any authenticated write of a Pro table, even when
-- the values are unchanged, so bins, grain, equipment, maintenance, and FSA/CLU
-- rows are removed from the undo payload. The stored snapshot still has them,
-- so a later Pro undo can restore them. Nothing is hard-deleted.
--
-- _restore_table_for_farm writes with INSERT ... ON CONFLICT. PostgreSQL runs
-- BEFORE INSERT triggers on that proposed row before the conflict becomes an
-- update, and those triggers see an empty OLD row. Copying the live landlord
-- or the live bin destination onto the payload therefore still looks like a
-- new Pro write and raises premium_required.
-- Gated field columns are omitted instead. The restore leaves those columns
-- out of the INSERT and the UPDATE, so the live values stay and a field that
-- has to be inserted again does not gain them.
-- Harvest destination is NOT NULL, so it cannot be omitted. The live
-- destination and bin_id are copied onto an existing harvest. A harvest that
-- no longer exists is replayed without a bin link. guard_harvest_bin and
-- guard_field_premium_columns then treat acreledger.restoring as "compare this
-- INSERT to the row already stored", not as a bypass: a changed or brand-new
-- gated value still calls assert_premium. Only undo_pre_season_reset and
-- restore_farm_backup set that transaction-local flag (the file-restore
-- wrapper still calls assert_premium first). PostgREST clients cannot set it.
--
-- Only the farm's newest non-deleted snapshot can be undone, once, within 30
-- days. Older snapshots are kept for a short audit trail and then soft-deleted.
-- Nothing here hard-deletes farm records.

CREATE TABLE IF NOT EXISTS public.pre_season_reset_snapshots (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id uuid,
  from_season integer NOT NULL,
  to_season integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  undone_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT pre_season_reset_snapshots_season_step CHECK (to_season = from_season + 1)
);

CREATE INDEX IF NOT EXISTS pre_season_reset_snapshots_farm_created_idx
  ON public.pre_season_reset_snapshots (farm_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.pre_season_reset_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pre_season_reset_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pre_season_reset_snapshots TO service_role;
REVOKE MAINTAIN ON TABLE public.pre_season_reset_snapshots FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.pre_season_reset_snapshots IS
  'Server-built pre-season reset snapshots. Clients cannot read or write this table. Undo uses the newest row only; older rows are soft-deleted, never hard-deleted.';

-- Tables _restore_farm_backup_impl knows how to replay. Names are fixed here,
-- never taken from the client.
CREATE OR REPLACE FUNCTION public._pre_season_snapshot_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'fields',
    'bins',
    'plant_records',
    'spray_records',
    'harvest_records',
    'hay_harvest_records',
    'custom_spray_records',
    'fertilizer_applications',
    'tillage_records',
    'grain_movements',
    'saved_seeds',
    'fertilizer_recipes',
    'spray_recipes',
    'work_requests',
    'equipment',
    'maintenance_schedules',
    'maintenance_logs',
    'fsa_tract_imports',
    'field_clu_assignments'
  ]::text[]
$$;

REVOKE ALL ON FUNCTION public._pre_season_snapshot_tables() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._pre_season_snapshot_rows(p_table text, p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF p_table IS NULL OR p_table <> ALL (public._pre_season_snapshot_tables()) THEN
    RAISE EXCEPTION 'invalid snapshot table' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.to_regclass(format('public.%I', p_table)) IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.id), ''[]''::jsonb)
     FROM public.%I AS t
     WHERE t.farm_id = $1',
    p_table
  ) INTO v_rows USING p_farm_id;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public._pre_season_snapshot_rows(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._pre_season_rollback_tables(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(name ORDER BY name), '[]'::jsonb)
  FROM unnest(public._pre_season_snapshot_tables()) AS name
  WHERE jsonb_typeof(p_payload -> name) = 'array'
$$;

REVOKE ALL ON FUNCTION public._pre_season_rollback_tables(jsonb) FROM PUBLIC, anon, authenticated;

-- INSERT ... ON CONFLICT fires BEFORE INSERT with an empty OLD row. During a
-- restore, compare gated values to the row already stored so an unchanged
-- value is not a new Pro write. A missing row, or a value that differs, still
-- goes through assert_premium. This is not a bypass.
CREATE OR REPLACE FUNCTION public.guard_field_premium_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.fields%ROWTYPE;
  v_old jsonb;
  v_new jsonb := pg_catalog.to_jsonb(NEW);
  c text;
  v_old_val text;
  v_new_val text;
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := pg_catalog.to_jsonb(OLD);
  ELSIF pg_catalog.current_setting('acreledger.restoring', true) = 'on' THEN
    SELECT f.* INTO v_existing FROM public.fields f WHERE f.id = NEW.id;
    v_old := CASE WHEN FOUND THEN pg_catalog.to_jsonb(v_existing) ELSE '{}'::jsonb END;
  ELSE
    v_old := '{}'::jsonb;
  END IF;

  FOREACH c IN ARRAY ARRAY['fsa_farm_number', 'fsa_tract_number', 'fsa_field_number', 'clu_numbers'] LOOP
    v_new_val := nullif(nullif(btrim(v_new->>c), ''), '[]');
    v_old_val := nullif(nullif(btrim(v_old->>c), ''), '[]');
    IF v_new_val IS NOT NULL AND v_new_val IS DISTINCT FROM v_old_val THEN
      PERFORM public.assert_premium(NEW.farm_id, 'fsa_tract');
      EXIT;
    END IF;
  END LOOP;

  v_new_val := nullif(btrim(v_new->>'landlord_name'), '');
  v_old_val := nullif(btrim(v_old->>'landlord_name'), '');
  IF v_new_val IS NOT NULL AND v_new_val IS DISTINCT FROM v_old_val THEN
    PERFORM public.assert_premium(NEW.farm_id, 'landlord_split');
  END IF;

  IF NEW.producer_share IS NOT NULL AND NEW.producer_share < 100
     AND NEW.producer_share IS DISTINCT FROM (v_old->>'producer_share')::numeric THEN
    PERFORM public.assert_premium(NEW.farm_id, 'landlord_split');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_field_premium_columns() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_harvest_bin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.harvest_records%ROWTYPE;
  v_old jsonb;
  v_new jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := pg_catalog.to_jsonb(OLD);
  ELSIF pg_catalog.current_setting('acreledger.restoring', true) = 'on' THEN
    SELECT h.* INTO v_existing FROM public.harvest_records h WHERE h.id = NEW.id;
    v_old := CASE WHEN FOUND THEN pg_catalog.to_jsonb(v_existing) ELSE '{}'::jsonb END;
  ELSE
    v_old := '{}'::jsonb;
  END IF;

  IF (v_new->>'destination' = 'bin' OR v_new->>'bin_id' IS NOT NULL)
     AND (v_new->>'destination' IS DISTINCT FROM v_old->>'destination'
          OR v_new->>'bin_id' IS DISTINCT FROM v_old->>'bin_id') THEN
    PERFORM public.assert_premium(NEW.farm_id, 'grain');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_harvest_bin() FROM PUBLIC, anon, authenticated;

-- Free + enforce: drop whole Pro tables. Omit gated field columns so they are
-- neither updated nor created. Pin an existing harvest's bin link to the live
-- row; a missing harvest is replayed with no bin link.
CREATE OR REPLACE FUNCTION public._pre_season_payload_for_undo(p_payload jsonb, p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
  v_payload jsonb := p_payload;
  v_fields jsonb;
  v_harvests jsonb;
BEGIN
  IF public.entitlements_mode() IS DISTINCT FROM 'enforce' THEN
    RETURN v_payload;
  END IF;
  SELECT e.plan INTO v_plan FROM public._farm_entitlement(p_farm_id) e;
  IF v_plan IS DISTINCT FROM 'free' THEN
    RETURN v_payload;
  END IF;

  v_payload := v_payload
    - 'bins'
    - 'grain_movements'
    - 'equipment'
    - 'maintenance_schedules'
    - 'maintenance_logs'
    - 'fsa_tract_imports'
    - 'field_clu_assignments';

  IF jsonb_typeof(v_payload->'fields') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      item
        - 'fsa_farm_number'
        - 'fsa_tract_number'
        - 'fsa_field_number'
        - 'clu_numbers'
        - 'landlord_name'
        - 'producer_share'
    ), '[]'::jsonb)
    INTO v_fields
    FROM jsonb_array_elements(v_payload->'fields') AS item;
    v_payload := jsonb_set(v_payload, '{fields}', v_fields, true);
  END IF;

  IF jsonb_typeof(v_payload->'harvest_records') = 'array' THEN
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN live.row IS NOT NULL THEN item || pg_catalog.jsonb_build_object(
          'destination', live.row->'destination',
          'bin_id', live.row->'bin_id'
        )
        WHEN COALESCE(item->>'destination', '') = 'bin'
          OR NULLIF(item->>'bin_id', '') IS NOT NULL THEN
          (item - 'bin_id') || pg_catalog.jsonb_build_object(
            'destination',
            pg_catalog.to_jsonb(
              CASE
                WHEN item->>'destination' IS NOT NULL AND item->>'destination' <> 'bin'
                  THEN item->>'destination'
                ELSE 'elevator'
              END
            ),
            'bin_id', 'null'::jsonb
          )
        ELSE item
      END
    ), '[]'::jsonb)
    INTO v_harvests
    FROM jsonb_array_elements(v_payload->'harvest_records') AS item
    LEFT JOIN LATERAL (
      SELECT pg_catalog.to_jsonb(h) AS row
      FROM public.harvest_records h
      WHERE h.id = (item->>'id')::uuid
        AND h.farm_id = p_farm_id
    ) AS live ON true;
    v_payload := jsonb_set(v_payload, '{harvest_records}', v_harvests, true);
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public._pre_season_payload_for_undo(jsonb, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_pre_season_reset(
  p_from_season integer,
  p_to_season integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_active integer;
  v_year integer := EXTRACT(YEAR FROM pg_catalog.now())::integer;
  v_payload jsonb := '{}'::jsonb;
  v_table text;
  v_rows jsonb;
  v_id uuid;
  v_updated integer;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_from_season IS NULL OR p_to_season IS NULL THEN
    RAISE EXCEPTION 'Season years are required.' USING ERRCODE = '22023';
  END IF;
  IF p_to_season IS DISTINCT FROM p_from_season + 1 THEN
    RAISE EXCEPTION 'The new season must be exactly one year after the current season.'
      USING ERRCODE = '22023';
  END IF;
  IF p_from_season < 2000 OR p_to_season > v_year + 1 THEN
    RAISE EXCEPTION 'Invalid active season.' USING ERRCODE = '22023';
  END IF;

  SELECT p.farm_id, p.active_season
  INTO v_farm_id, v_active
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.' USING ERRCODE = '42501';
  END IF;
  IF v_active IS DISTINCT FROM p_from_season THEN
    RAISE EXCEPTION 'Active season changed elsewhere' USING ERRCODE = '22023';
  END IF;

  FOREACH v_table IN ARRAY public._pre_season_snapshot_tables() LOOP
    v_rows := public._pre_season_snapshot_rows(v_table, v_farm_id);
    IF v_rows IS NOT NULL THEN
      v_payload := v_payload || jsonb_build_object(v_table, v_rows);
    END IF;
  END LOOP;

  INSERT INTO public.pre_season_reset_snapshots (
    farm_id, user_id, from_season, to_season, payload
  )
  VALUES (v_farm_id, v_user_id, p_from_season, p_to_season, v_payload)
  RETURNING id INTO v_id;

  UPDATE public.profiles
  SET active_season = p_to_season
  WHERE id = v_user_id
    AND farm_id = v_farm_id
    AND active_season = p_from_season;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Active season changed elsewhere' USING ERRCODE = '22023';
  END IF;

  -- Keep the three newest snapshots. Soft-delete the rest. Never hard-delete.
  WITH ranked AS (
    SELECT s.id
    FROM public.pre_season_reset_snapshots s
    WHERE s.farm_id = v_farm_id
      AND s.deleted_at IS NULL
    ORDER BY s.created_at DESC, s.id DESC
    OFFSET 3
  )
  UPDATE public.pre_season_reset_snapshots AS target
  SET deleted_at = pg_catalog.now()
  WHERE target.id IN (SELECT ranked.id FROM ranked);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_pre_season_reset(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_pre_season_reset(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_pre_season_reset(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
  v_snap public.pre_season_reset_snapshots%ROWTYPE;
  v_latest uuid;
  v_payload jsonb;
  v_result jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.farm_id
  INTO v_farm_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.' USING ERRCODE = '42501';
  END IF;

  SELECT s.*
  INTO v_snap
  FROM public.pre_season_reset_snapshots s
  WHERE s.id = p_snapshot_id
    AND s.farm_id = v_farm_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pre-season reset snapshot not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id
  INTO v_latest
  FROM public.pre_season_reset_snapshots s
  WHERE s.farm_id = v_farm_id
    AND s.deleted_at IS NULL
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 1;

  IF v_snap.id IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'Only the latest pre-season reset can be undone.' USING ERRCODE = '22023';
  END IF;
  IF v_snap.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'This pre-season reset was already undone.' USING ERRCODE = '22023';
  END IF;
  IF v_snap.created_at < pg_catalog.now() - interval '30 days' THEN
    RAISE EXCEPTION 'This pre-season reset is older than 30 days and cannot be undone.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_snap.payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Stored pre-season snapshot is invalid.' USING ERRCODE = '22023';
  END IF;

  v_payload := public._pre_season_payload_for_undo(v_snap.payload, v_farm_id);
  v_payload := v_payload || jsonb_build_object(
    '_pre_season_reset', true,
    '_expected_active_season', v_snap.to_season,
    '_rollback_tables', public._pre_season_rollback_tables(v_payload)
  );

  -- Field age only. Premium guards do not treat this flag as a bypass.
  PERFORM set_config('acreledger.restoring', 'on', true);
  v_result := public._restore_farm_backup_impl(v_payload, v_snap.from_season);

  UPDATE public.pre_season_reset_snapshots
  SET undone_at = pg_catalog.now()
  WHERE id = v_snap.id
    AND undone_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This pre-season reset was already undone.' USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_pre_season_reset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_pre_season_reset(uuid) TO authenticated;
