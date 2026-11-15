BEGIN;

ALTER TABLE public.farms
  ADD COLUMN runs_cattle boolean NOT NULL DEFAULT false;

CREATE TABLE public.cattle_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  class text NOT NULL CHECK (class IN (
    'cows', 'bulls', 'calves', 'replacement_heifers', 'stockers', 'mixed'
  )),
  head_count integer NOT NULL DEFAULT 0 CHECK (head_count >= 0),
  current_field_id uuid,
  current_since date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cattle_groups_farm_id_id_key UNIQUE (farm_id, id),
  CONSTRAINT cattle_groups_current_field_pair CHECK (
    current_field_id IS NULL OR current_since IS NOT NULL
  ),
  CONSTRAINT cattle_groups_farm_current_field_fk
    FOREIGN KEY (farm_id, current_field_id)
    REFERENCES public.fields(farm_id, id)
);

CREATE UNIQUE INDEX cattle_groups_live_name_unique
  ON public.cattle_groups (farm_id, lower(btrim(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE public.cattle_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  field_id uuid,
  moved_on date NOT NULL,
  head_count integer NOT NULL CHECK (head_count >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cattle_moves_farm_id_id_key UNIQUE (farm_id, id),
  CONSTRAINT cattle_moves_farm_group_fk
    FOREIGN KEY (farm_id, group_id)
    REFERENCES public.cattle_groups(farm_id, id),
  CONSTRAINT cattle_moves_farm_field_fk
    FOREIGN KEY (farm_id, field_id)
    REFERENCES public.fields(farm_id, id)
);

CREATE TABLE public.cattle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed'
  )),
  event_date date NOT NULL,
  head_delta integer NOT NULL,
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cattle_events_farm_id_id_key UNIQUE (farm_id, id),
  CONSTRAINT cattle_events_farm_group_fk
    FOREIGN KEY (farm_id, group_id)
    REFERENCES public.cattle_groups(farm_id, id),
  CONSTRAINT cattle_events_delta_matches_type CHECK (
    (event_type IN ('calving', 'head_added') AND head_delta > 0)
    OR (event_type IN ('death', 'head_removed') AND head_delta < 0)
    OR (event_type IN ('weaning', 'working', 'preg_check') AND head_delta = 0)
  ),
  CONSTRAINT cattle_events_removed_reason CHECK (
    event_type <> 'head_removed'
    OR reason IN ('shipped', 'died', 'moved_to_another_group')
  )
);

CREATE INDEX cattle_groups_farm_deleted_idx
  ON public.cattle_groups (farm_id, deleted_at);
CREATE INDEX cattle_moves_farm_deleted_idx
  ON public.cattle_moves (farm_id, deleted_at);
CREATE INDEX cattle_moves_group_date_idx
  ON public.cattle_moves (farm_id, group_id, moved_on DESC, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX cattle_moves_field_date_idx
  ON public.cattle_moves (farm_id, field_id, moved_on DESC)
  WHERE deleted_at IS NULL AND field_id IS NOT NULL;
CREATE INDEX cattle_events_farm_deleted_idx
  ON public.cattle_events (farm_id, deleted_at);
CREATE INDEX cattle_events_group_date_idx
  ON public.cattle_events (farm_id, group_id, event_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE FUNCTION public.set_cattle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cattle_groups_set_updated_at
  BEFORE UPDATE ON public.cattle_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_cattle_updated_at();
CREATE TRIGGER cattle_moves_set_updated_at
  BEFORE UPDATE ON public.cattle_moves
  FOR EACH ROW EXECUTE FUNCTION public.set_cattle_updated_at();
CREATE TRIGGER cattle_events_set_updated_at
  BEFORE UPDATE ON public.cattle_events
  FOR EACH ROW EXECUTE FUNCTION public.set_cattle_updated_at();

-- Current pasture, moves/events, and tombstones are atomic RPC-owned state.
-- Direct group edits may still change name, class, head_count, and notes so a
-- free farm can correct its group count without logging an event.
CREATE FUNCTION public.guard_cattle_rpc_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rpc boolean := current_setting('acreledger.cattle_rpc', true) = 'on';
  v_restoring boolean := current_setting('acreledger.restoring', true) = 'on';
BEGIN
  IF v_rpc OR v_restoring THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'cattle_groups' THEN
    IF TG_OP = 'INSERT' AND (NEW.current_field_id IS NOT NULL OR NEW.current_since IS NOT NULL) THEN
      RAISE EXCEPTION 'Current pasture changes must use move_cattle_group'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.current_field_id IS DISTINCT FROM OLD.current_field_id
      OR NEW.current_since IS DISTINCT FROM OLD.current_since
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    ) THEN
      RAISE EXCEPTION 'Cattle pasture and deletion changes must use a cattle RPC'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cattle moves and events must use a cattle RPC'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER cattle_groups_rpc_columns
  BEFORE INSERT OR UPDATE ON public.cattle_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_cattle_rpc_columns();
CREATE TRIGGER cattle_moves_rpc_columns
  BEFORE INSERT OR UPDATE ON public.cattle_moves
  FOR EACH ROW EXECUTE FUNCTION public.guard_cattle_rpc_columns();
CREATE TRIGGER cattle_events_rpc_columns
  BEFORE INSERT OR UPDATE ON public.cattle_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_cattle_rpc_columns();

ALTER TABLE public.cattle_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cattle_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cattle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cattle_groups_select ON public.cattle_groups
  FOR SELECT TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
  );
CREATE POLICY cattle_groups_insert ON public.cattle_groups
  FOR INSERT TO authenticated WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY cattle_groups_update ON public.cattle_groups
  FOR UPDATE TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Restrict updates on deleted rows" ON public.cattle_groups
  AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY cattle_moves_select ON public.cattle_moves
  FOR SELECT TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
  );
CREATE POLICY cattle_moves_insert ON public.cattle_moves
  FOR INSERT TO authenticated WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY cattle_moves_update ON public.cattle_moves
  FOR UPDATE TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Restrict updates on deleted rows" ON public.cattle_moves
  AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

CREATE POLICY cattle_events_select ON public.cattle_events
  FOR SELECT TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
  );
CREATE POLICY cattle_events_insert ON public.cattle_events
  FOR INSERT TO authenticated WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY cattle_events_update ON public.cattle_events
  FOR UPDATE TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Restrict updates on deleted rows" ON public.cattle_events
  AS RESTRICTIVE FOR UPDATE USING (deleted_at IS NULL) WITH CHECK (true);

REVOKE ALL ON TABLE public.cattle_groups, public.cattle_moves, public.cattle_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cattle_groups, public.cattle_moves, public.cattle_events
  TO authenticated;
GRANT ALL ON TABLE public.cattle_groups, public.cattle_moves, public.cattle_events
  TO service_role;

CREATE FUNCTION public.set_runs_cattle(
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
  IF p_runs_cattle IS NULL THEN
    RAISE EXCEPTION 'runs_cattle is required' USING ERRCODE = '23502';
  END IF;

  UPDATE public.farms
  SET runs_cattle = p_runs_cattle
  WHERE id = p_farm_id;
  RETURN p_runs_cattle;
END;
$$;

CREATE FUNCTION public.move_cattle_group(
  p_farm_id uuid,
  p_move_id uuid,
  p_group_id uuid,
  p_field_id uuid,
  p_moved_on date,
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
  v_existing public.cattle_moves%ROWTYPE;
  v_updates_current boolean := false;
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
  IF p_moved_on IS NULL OR p_moved_on > current_date THEN
    RAISE EXCEPTION 'Move date cannot be in the future' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.cattle_moves
  WHERE id = p_move_id AND farm_id = p_farm_id;
  IF FOUND THEN
    IF v_existing.group_id IS DISTINCT FROM p_group_id
       OR v_existing.field_id IS DISTINCT FROM p_field_id
       OR v_existing.moved_on IS DISTINCT FROM p_moved_on
       OR v_existing.notes IS DISTINCT FROM p_notes THEN
      RAISE EXCEPTION 'Move id already belongs to a different cattle move'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'move_id', p_move_id,
      'group_id', p_group_id,
      'head_count', v_existing.head_count,
      'current_updated', false,
      'already_applied', true
    );
  END IF;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = p_group_id
    AND farm_id = p_farm_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_field_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fields
    WHERE id = p_field_id AND farm_id = p_farm_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Field not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_moves (
    id, farm_id, group_id, field_id, moved_on, head_count, notes
  ) VALUES (
    p_move_id, p_farm_id, p_group_id, p_field_id, p_moved_on, v_group.head_count, p_notes
  );

  IF v_group.current_since IS NULL OR p_moved_on >= v_group.current_since THEN
    UPDATE public.cattle_groups
    SET current_field_id = p_field_id,
        current_since = p_moved_on
    WHERE id = p_group_id AND farm_id = p_farm_id;
    v_updates_current := true;
  END IF;

  RETURN jsonb_build_object(
    'move_id', p_move_id,
    'group_id', p_group_id,
    'head_count', v_group.head_count,
    'current_updated', v_updates_current,
    'already_applied', false
  );
END;
$$;

CREATE FUNCTION public.log_cattle_event(
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
  IF p_event_date IS NULL OR p_event_date > current_date THEN
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
     AND p_reason NOT IN ('shipped', 'died', 'moved_to_another_group') THEN
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
       OR v_existing.reason IS DISTINCT FROM p_reason
       OR v_existing.notes IS DISTINCT FROM p_notes THEN
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
    p_head_delta, p_reason, p_notes
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

CREATE FUNCTION public.soft_delete_cattle_row(
  p_farm_id uuid,
  p_row_type text,
  p_row_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_group public.cattle_groups%ROWTYPE;
  v_move public.cattle_moves%ROWTYPE;
  v_event public.cattle_events%ROWTYPE;
  v_latest_move public.cattle_moves%ROWTYPE;
  v_deleted_at timestamptz := now();
  v_head_count integer;
  v_moves integer := 0;
  v_events integer := 0;
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
  IF p_row_type NOT IN ('group', 'move', 'event') THEN
    RAISE EXCEPTION 'Unknown cattle row type' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);

  IF p_row_type = 'group' THEN
    SELECT * INTO v_group
    FROM public.cattle_groups
    WHERE id = p_row_id AND farm_id = p_farm_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_group.deleted_at IS NOT NULL THEN
      RETURN jsonb_build_object('row_type', p_row_type, 'row_id', p_row_id, 'already_applied', true);
    END IF;

    PERFORM 1 FROM public.cattle_moves
    WHERE farm_id = p_farm_id AND group_id = p_row_id
    FOR UPDATE;
    PERFORM 1 FROM public.cattle_events
    WHERE farm_id = p_farm_id AND group_id = p_row_id
    FOR UPDATE;

    UPDATE public.cattle_moves
    SET deleted_at = v_deleted_at
    WHERE farm_id = p_farm_id AND group_id = p_row_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_moves = ROW_COUNT;
    UPDATE public.cattle_events
    SET deleted_at = v_deleted_at
    WHERE farm_id = p_farm_id AND group_id = p_row_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_events = ROW_COUNT;
    UPDATE public.cattle_groups
    SET deleted_at = v_deleted_at
    WHERE id = p_row_id AND farm_id = p_farm_id AND deleted_at IS NULL;

    RETURN jsonb_build_object(
      'row_type', p_row_type,
      'row_id', p_row_id,
      'moves', v_moves,
      'events', v_events,
      'already_applied', false
    );
  END IF;

  IF p_row_type = 'move' THEN
    SELECT * INTO v_move
    FROM public.cattle_moves
    WHERE id = p_row_id AND farm_id = p_farm_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cattle move not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_move.deleted_at IS NOT NULL THEN
      RETURN jsonb_build_object('row_type', p_row_type, 'row_id', p_row_id, 'already_applied', true);
    END IF;

    SELECT * INTO v_group
    FROM public.cattle_groups
    WHERE id = v_move.group_id AND farm_id = p_farm_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.cattle_moves
    SET deleted_at = v_deleted_at
    WHERE id = p_row_id AND farm_id = p_farm_id AND deleted_at IS NULL;

    SELECT * INTO v_latest_move
    FROM public.cattle_moves
    WHERE farm_id = p_farm_id
      AND group_id = v_move.group_id
      AND deleted_at IS NULL
    ORDER BY moved_on DESC, created_at DESC, id DESC
    LIMIT 1;

    UPDATE public.cattle_groups
    SET current_field_id = CASE WHEN FOUND THEN v_latest_move.field_id ELSE NULL END,
        current_since = CASE WHEN FOUND THEN v_latest_move.moved_on ELSE NULL END
    WHERE id = v_move.group_id AND farm_id = p_farm_id;

    RETURN jsonb_build_object('row_type', p_row_type, 'row_id', p_row_id, 'already_applied', false);
  END IF;

  SELECT * INTO v_event
  FROM public.cattle_events
  WHERE id = p_row_id AND farm_id = p_farm_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle event not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('row_type', p_row_type, 'row_id', p_row_id, 'already_applied', true);
  END IF;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = v_event.group_id AND farm_id = p_farm_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  v_head_count := v_group.head_count - v_event.head_delta;
  IF v_head_count < 0 THEN
    RAISE EXCEPTION 'Deleting this cattle event would make head count negative'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.cattle_events
  SET deleted_at = v_deleted_at
  WHERE id = p_row_id AND farm_id = p_farm_id AND deleted_at IS NULL;
  UPDATE public.cattle_groups
  SET head_count = v_head_count
  WHERE id = v_event.group_id AND farm_id = p_farm_id;

  RETURN jsonb_build_object(
    'row_type', p_row_type,
    'row_id', p_row_id,
    'head_count', v_head_count,
    'already_applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_cattle_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_cattle_rpc_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_runs_cattle(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_cattle_group(uuid, uuid, uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_runs_cattle(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_cattle_group(uuid, uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.farms.runs_cattle IS
  'Farm-level opt-in for the Cattle feature. Defaults off.';
COMMENT ON FUNCTION public.move_cattle_group(uuid, uuid, uuid, uuid, date, text) IS
  'Idempotently records a group move and changes current pasture only when the move date is current or newer.';
COMMENT ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) IS
  'Idempotently records one cattle event and applies its head-count delta atomically.';
COMMENT ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) IS
  'Soft-deletes a cattle group, move, or event; group children cascade and event deltas reverse atomically.';

COMMIT;
