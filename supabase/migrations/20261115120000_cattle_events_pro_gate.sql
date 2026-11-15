-- Cattle events are Pro. Logging an event or moving head between groups needs a paid
-- plan; groups, pasture moves, editing a group's head count and deleting an event stay
-- free. assert_premium is a no-op while entitlements are off, and only raises in enforce
-- mode, so this changes nothing until enforcement is switched on.
--
-- 1. 'cattle_events' joins the fixed assert_premium allowlist (same body as 20261110190000).
-- 2. log_cattle_event and transfer_cattle_head call it. The call comes after the
--    already-applied return, so replaying a saved change never parks.
-- soft_delete_cattle_row is deliberately NOT gated: removing an event stays allowed on free.

CREATE OR REPLACE FUNCTION public.assert_premium(p_farm_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text;
  v_plan text;
BEGIN
  -- Fixed allowlist. Checked before mode, membership, and any shadow insert
  -- so a caller cannot fill entitlement_shadow_log with arbitrary names.
  IF p_feature IS NULL OR p_feature NOT IN (
    'reports', 'grain', 'equipment', 'landlord_split', 'fsa_tract',
    'backup_restore', 'field_cap', 'rainfall', 'cattle_events'
  ) THEN
    RAISE EXCEPTION 'invalid feature name' USING ERRCODE = '22023';
  END IF;

  v_mode := public.entitlements_mode();
  IF v_mode = 'off' THEN RETURN; END IF;
  -- Authenticated callers must belong to the farm; service_role/internal callers have no uid.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id
  ) THEN
    RAISE EXCEPTION 'not a member of this farm' USING ERRCODE = '42501';
  END IF;
  SELECT e.plan INTO v_plan FROM public._farm_entitlement(p_farm_id) e;
  IF v_plan <> 'free' THEN RETURN; END IF;
  IF v_mode = 'shadow' THEN
    INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan, user_id)
    SELECT p_farm_id, p_feature, v_plan, auth.uid()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.entitlement_shadow_log l
      WHERE l.farm_id = p_farm_id
        AND l.feature = p_feature
        AND l.created_at > pg_catalog.now() - interval '1 minute'
    );
    RETURN;
  END IF;
  RAISE EXCEPTION 'premium_required:%', p_feature USING ERRCODE = 'P0402';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_premium(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_premium(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_cattle_event(
  p_farm_id uuid,
  p_event_id uuid,
  p_group_id uuid,
  p_event_type text,
  p_event_date date,
  p_head_delta integer,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_group public.cattle_groups%ROWTYPE;
  v_existing public.cattle_events%ROWTYPE;
  v_notes text := nullif(btrim(p_notes), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_head_count integer;
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
  IF p_event_date IS NULL OR p_event_date > current_date + 1 THEN
    RAISE EXCEPTION 'Event date cannot be in the future' USING ERRCODE = '23514';
  END IF;
  IF p_event_type NOT IN (
    'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed'
  ) THEN
    RAISE EXCEPTION 'Unknown cattle event type' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (p_event_type IN ('calving', 'head_added') AND p_head_delta > 0)
    OR (p_event_type IN ('death', 'head_removed') AND p_head_delta < 0)
    OR (p_event_type IN ('weaning', 'working', 'preg_check') AND p_head_delta = 0)
  ) THEN
    RAISE EXCEPTION 'Head-count change does not match the cattle event type'
      USING ERRCODE = '23514';
  END IF;
  IF p_event_type = 'head_removed'
     AND (v_reason IS NULL OR v_reason NOT IN ('shipped', 'moved_to_another_group')) THEN
    RAISE EXCEPTION 'Head removed requires a valid reason' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.cattle_events
  WHERE id = p_event_id AND farm_id = p_farm_id;
  IF FOUND THEN
    IF v_existing.group_id IS DISTINCT FROM p_group_id
       OR v_existing.event_type IS DISTINCT FROM p_event_type
       OR v_existing.event_date IS DISTINCT FROM p_event_date
       OR v_existing.head_delta IS DISTINCT FROM p_head_delta
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.notes IS DISTINCT FROM v_notes
       OR v_existing.transfer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Event id already belongs to a different cattle event'
        USING ERRCODE = '23505';
    END IF;
    SELECT head_count INTO v_head_count
    FROM public.cattle_groups
    WHERE id = p_group_id AND farm_id = p_farm_id;
    RETURN jsonb_build_object(
      'event_id', p_event_id,
      'group_id', p_group_id,
      'head_count', v_head_count,
      'already_applied', true
    );
  END IF;

  -- Pro feature. Checked after the already-applied return above, so replaying a
  -- change that is already saved never parks; only a new write is gated.
  PERFORM public.assert_premium(p_farm_id, 'cattle_events');

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = p_group_id
    AND farm_id = p_farm_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  v_head_count := v_group.head_count + p_head_delta;
  IF v_head_count < 0 THEN
    RAISE EXCEPTION 'Cattle event would make head count negative'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes
  ) VALUES (
    p_event_id, p_farm_id, p_group_id, p_event_type, p_event_date,
    p_head_delta, v_reason, v_notes
  );
  UPDATE public.cattle_groups
  SET head_count = v_head_count
  WHERE id = p_group_id AND farm_id = p_farm_id;

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'group_id', p_group_id,
    'head_count', v_head_count,
    'already_applied', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_cattle_head(
  p_farm_id uuid,
  p_from_event_id uuid,
  p_to_event_id uuid,
  p_from_group_id uuid,
  p_to_group_id uuid,
  p_head integer,
  p_event_date date,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
  v_from public.cattle_events%ROWTYPE;
  v_to public.cattle_events%ROWTYPE;
  v_has_from boolean;
  v_has_to boolean;
  v_locked integer;
  v_from_head integer;
  v_to_head integer;
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
  IF p_from_event_id IS NULL OR p_to_event_id IS NULL
     OR p_from_event_id = p_to_event_id
     OR p_from_group_id IS NULL OR p_to_group_id IS NULL
     OR p_from_group_id = p_to_group_id THEN
    RAISE EXCEPTION 'A transfer needs two different events and two different groups'
      USING ERRCODE = '23514';
  END IF;
  IF p_head IS NULL OR p_head <= 0 THEN
    RAISE EXCEPTION 'Transfer head count must be a positive whole number'
      USING ERRCODE = '23514';
  END IF;
  IF p_event_date IS NULL OR p_event_date > current_date + 1 THEN
    RAISE EXCEPTION 'Event date cannot be in the future' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_from
  FROM public.cattle_events
  WHERE id = p_from_event_id AND farm_id = p_farm_id;
  v_has_from := FOUND;
  SELECT * INTO v_to
  FROM public.cattle_events
  WHERE id = p_to_event_id AND farm_id = p_farm_id;
  v_has_to := FOUND;

  IF v_has_from OR v_has_to THEN
    -- Replay is idempotent only when BOTH halves exist and match exactly.
    IF NOT (v_has_from AND v_has_to)
       OR v_from.group_id IS DISTINCT FROM p_from_group_id
       OR v_from.event_type IS DISTINCT FROM 'head_removed'
       OR v_from.event_date IS DISTINCT FROM p_event_date
       OR v_from.head_delta IS DISTINCT FROM -p_head
       OR v_from.reason IS DISTINCT FROM 'moved_to_another_group'
       OR v_from.notes IS DISTINCT FROM v_notes
       OR v_from.transfer_id IS DISTINCT FROM p_from_event_id
       OR v_to.group_id IS DISTINCT FROM p_to_group_id
       OR v_to.event_type IS DISTINCT FROM 'head_added'
       OR v_to.event_date IS DISTINCT FROM p_event_date
       OR v_to.head_delta IS DISTINCT FROM p_head
       OR v_to.reason IS NOT NULL
       OR v_to.notes IS DISTINCT FROM v_notes
       OR v_to.transfer_id IS DISTINCT FROM p_from_event_id THEN
      RAISE EXCEPTION 'Event id already belongs to a different cattle event'
        USING ERRCODE = '23505';
    END IF;
    SELECT head_count INTO v_from_head FROM public.cattle_groups
    WHERE id = p_from_group_id AND farm_id = p_farm_id;
    SELECT head_count INTO v_to_head FROM public.cattle_groups
    WHERE id = p_to_group_id AND farm_id = p_farm_id;
    RETURN jsonb_build_object(
      'transfer_id', p_from_event_id,
      'from_group_id', p_from_group_id,
      'to_group_id', p_to_group_id,
      'from_head_count', v_from_head,
      'to_head_count', v_to_head,
      'already_applied', true
    );
  END IF;

  -- Pro feature. Checked after the already-applied return above, so replaying a
  -- change that is already saved never parks; only a new write is gated.
  PERFORM public.assert_premium(p_farm_id, 'cattle_events');

  -- Lock both groups in id order so two opposite transfers cannot deadlock.
  SELECT count(*) INTO v_locked
  FROM (
    SELECT id
    FROM public.cattle_groups
    WHERE farm_id = p_farm_id
      AND deleted_at IS NULL
      AND id IN (p_from_group_id, p_to_group_id)
    ORDER BY id
    FOR UPDATE
  ) AS locked_groups;
  IF v_locked <> 2 THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT head_count INTO v_from_head FROM public.cattle_groups
  WHERE id = p_from_group_id AND farm_id = p_farm_id;
  SELECT head_count INTO v_to_head FROM public.cattle_groups
  WHERE id = p_to_group_id AND farm_id = p_farm_id;
  IF v_from_head < p_head THEN
    RAISE EXCEPTION 'Transfer would make head count negative'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes, transfer_id
  ) VALUES (
    p_from_event_id, p_farm_id, p_from_group_id, 'head_removed', p_event_date,
    -p_head, 'moved_to_another_group', v_notes, p_from_event_id
  );
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes, transfer_id
  ) VALUES (
    p_to_event_id, p_farm_id, p_to_group_id, 'head_added', p_event_date,
    p_head, NULL, v_notes, p_from_event_id
  );
  v_from_head := v_from_head - p_head;
  v_to_head := v_to_head + p_head;
  UPDATE public.cattle_groups SET head_count = v_from_head
  WHERE id = p_from_group_id AND farm_id = p_farm_id;
  UPDATE public.cattle_groups SET head_count = v_to_head
  WHERE id = p_to_group_id AND farm_id = p_farm_id;

  RETURN jsonb_build_object(
    'transfer_id', p_from_event_id,
    'from_group_id', p_from_group_id,
    'to_group_id', p_to_group_id,
    'from_head_count', v_from_head,
    'to_head_count', v_to_head,
    'already_applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text) TO authenticated, service_role;
