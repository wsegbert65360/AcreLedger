-- Review 2026-11-21 #35: farm-wide settings RPCs are owner/admin only.
-- Workers keep field records but cannot rename the farm, change the FSA
-- operator, toggle cattle, or start/undo a pre-season reset. Restore already
-- has this check.

CREATE OR REPLACE FUNCTION public._require_farm_manager(p_farm_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.farm_role INTO v_role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.farm_id = p_farm_id;

  IF v_role IS DISTINCT FROM 'owner' AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the farm owner or an admin can change farm settings.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._require_farm_manager(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_farm_fsa_operator(
  p_farm_id uuid,
  p_name text,
  p_address text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_user_farm_id
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
    RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public._require_farm_manager(p_farm_id);

  UPDATE public.farms
  SET fsa_operator_name = NULLIF(btrim(p_name), ''),
      fsa_operator_address = NULLIF(btrim(p_address), '')
  WHERE id = p_farm_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_runs_cattle(
  p_farm_id uuid,
  p_runs_cattle boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_user_farm_id
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_user_farm_id IS NULL OR v_user_farm_id <> p_farm_id THEN
    RAISE EXCEPTION 'Farm access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public._require_farm_manager(p_farm_id);
  IF p_runs_cattle IS NULL THEN
    RAISE EXCEPTION 'runs_cattle is required' USING ERRCODE = '23502';
  END IF;

  UPDATE public.farms
  SET runs_cattle = p_runs_cattle
  WHERE id = p_farm_id;
  RETURN p_runs_cattle;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_farm_name(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_farm_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Farm name cannot be empty.';
  END IF;

  SELECT farm_id INTO v_farm_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm associated with this user.';
  END IF;
  PERFORM public._require_farm_manager(v_farm_id);

  UPDATE public.farms
  SET name = trim(p_name)
  WHERE id = v_farm_id;

  RETURN true;
END;
$$;

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
  PERFORM public._require_farm_manager(v_farm_id);
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
  PERFORM public._require_farm_manager(v_farm_id);

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
