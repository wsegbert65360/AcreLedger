BEGIN;

-- Cattle database fixes (review 2026-11-14). Never edits the committed
-- 20261114120000 migration; everything here replaces or extends it.
--   a/b. head_removed needs a reason, and 'died' is no longer a reason
--        (a death is logged with the death event).
--   c.   Date check allows current_date + 1 so a farmer ahead of UTC can log
--        today. The forms keep the strict device-date check.
--   d.   notes/reason are trimmed and blank becomes NULL before insert and
--        before the replay comparison.
--   e.   Deleting an event floors the reversed head count at zero.
--   f.   transfer_cattle_head: one remove + one add in one transaction.
--   g.   Both halves of a transfer carry the same transfer_id, and deleting
--        either half reverses both.

-- Legacy 'died' removals become death events (same negative delta) so the
-- tightened CHECK can be added. Nothing is in production; this only matters
-- for dev/staging rows.
SELECT set_config('acreledger.cattle_rpc', 'on', true);
UPDATE public.cattle_events
SET event_type = 'death', reason = NULL
WHERE event_type = 'head_removed' AND reason = 'died';

ALTER TABLE public.cattle_events
  ADD COLUMN transfer_id uuid;

ALTER TABLE public.cattle_events
  DROP CONSTRAINT cattle_events_removed_reason;
ALTER TABLE public.cattle_events
  ADD CONSTRAINT cattle_events_removed_reason CHECK (
    event_type <> 'head_removed'
    OR (reason IS NOT NULL AND reason IN ('shipped', 'moved_to_another_group'))
  );
ALTER TABLE public.cattle_events
  ADD CONSTRAINT cattle_events_transfer_type CHECK (
    transfer_id IS NULL OR event_type IN ('head_added', 'head_removed')
  );

CREATE INDEX cattle_events_transfer_idx
  ON public.cattle_events (farm_id, transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.move_cattle_group(
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
  v_notes text := nullif(btrim(p_notes), '');
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
  -- current_date is UTC; one day of slack keeps farms ahead of UTC working.
  IF p_moved_on IS NULL OR p_moved_on > current_date + 1 THEN
    RAISE EXCEPTION 'Move date cannot be in the future' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.cattle_moves
  WHERE id = p_move_id AND farm_id = p_farm_id;
  IF FOUND THEN
    IF v_existing.group_id IS DISTINCT FROM p_group_id
       OR v_existing.field_id IS DISTINCT FROM p_field_id
       OR v_existing.moved_on IS DISTINCT FROM p_moved_on
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
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
    p_move_id, p_farm_id, p_group_id, p_field_id, p_moved_on, v_group.head_count, v_notes
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

CREATE FUNCTION public.transfer_cattle_head(
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

CREATE OR REPLACE FUNCTION public.soft_delete_cattle_row(
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
  v_half public.cattle_events%ROWTYPE;
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

  -- Lock every group this delete can touch, in id order (a transfer touches
  -- two). The requested event's own group must still be live.
  PERFORM 1
  FROM public.cattle_groups
  WHERE farm_id = p_farm_id
    AND deleted_at IS NULL
    AND id IN (
      SELECT e.group_id
      FROM public.cattle_events e
      WHERE e.farm_id = p_farm_id
        AND e.deleted_at IS NULL
        AND (
          e.id = p_row_id
          OR (v_event.transfer_id IS NOT NULL AND e.transfer_id = v_event.transfer_id)
        )
    )
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = v_event.group_id AND farm_id = p_farm_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  -- A transfer reverses both live halves together; a plain event reverses
  -- itself. Counts floor at zero and the delete is never refused for that.
  FOR v_half IN
    SELECT *
    FROM public.cattle_events
    WHERE farm_id = p_farm_id
      AND deleted_at IS NULL
      AND (
        id = p_row_id
        OR (v_event.transfer_id IS NOT NULL AND transfer_id = v_event.transfer_id)
      )
    ORDER BY group_id, id
    FOR UPDATE
  LOOP
    UPDATE public.cattle_events
    SET deleted_at = v_deleted_at
    WHERE id = v_half.id AND farm_id = p_farm_id AND deleted_at IS NULL;
    UPDATE public.cattle_groups
    SET head_count = greatest(head_count - v_half.head_delta, 0)
    WHERE id = v_half.group_id AND farm_id = p_farm_id AND deleted_at IS NULL;
    v_events := v_events + 1;
  END LOOP;

  SELECT head_count INTO v_head_count
  FROM public.cattle_groups
  WHERE id = v_event.group_id AND farm_id = p_farm_id;

  RETURN jsonb_build_object(
    'row_type', p_row_type,
    'row_id', p_row_id,
    'head_count', v_head_count,
    'events', v_events,
    'transfer_id', v_event.transfer_id,
    'already_applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_cattle_group(uuid, uuid, uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.move_cattle_group(uuid, uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text) IS
  'Atomically moves head between two groups as one head_removed (moved_to_another_group) and one head_added event sharing a transfer_id; idempotent on both event ids.';
COMMENT ON COLUMN public.cattle_events.transfer_id IS
  'Shared by both halves of a transfer_cattle_head call (equals the from-event id). Deleting either half reverses both.';

COMMIT;
