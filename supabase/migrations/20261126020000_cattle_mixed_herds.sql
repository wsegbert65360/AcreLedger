BEGIN;

-- Mixed herds (2026-11-25). A cow-calf herd keeps cows, heifers, bulls, calves,
-- steers and stockers together on one pasture, so a group now carries a count
-- per class. head_count stays as the total and is kept equal to the sum by a
-- trigger, so every reader, report and older client keeps working.
--
--   a. Six per-class count columns on cattle_groups, backfilled from head_count.
--   b. sync_cattle_class_counts: head_count := sum of the classes. A write that
--      only changes head_count (an older client or a backup without counts)
--      applies the difference to the group's own class.
--   c. cattle_events gains cattle_class (which class the head change hits),
--      calf_sex (calving only) and the 'reclass' event (move N head from one
--      class to another inside a herd: calves -> heifers, heifer -> cow).
--   d. log_cattle_event / transfer_cattle_head take an optional class; the old
--      argument lists still resolve (named arguments, new ones default NULL).
--   e. soft_delete_cattle_row reverses an event on the class it changed.

-- a. Per-class counts ----------------------------------------------------------
ALTER TABLE public.cattle_groups
  ADD COLUMN cows integer NOT NULL DEFAULT 0 CHECK (cows >= 0),
  ADD COLUMN heifers integer NOT NULL DEFAULT 0 CHECK (heifers >= 0),
  ADD COLUMN bulls integer NOT NULL DEFAULT 0 CHECK (bulls >= 0),
  ADD COLUMN calves integer NOT NULL DEFAULT 0 CHECK (calves >= 0),
  ADD COLUMN steers integer NOT NULL DEFAULT 0 CHECK (steers >= 0),
  ADD COLUMN stockers integer NOT NULL DEFAULT 0 CHECK (stockers >= 0);

-- Maps a herd type (cattle_groups.class) or a class name to a count column.
CREATE FUNCTION public._cattle_count_column(p_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_class
    WHEN 'cows' THEN 'cows'
    WHEN 'mixed' THEN 'cows'
    WHEN 'replacement_heifers' THEN 'heifers'
    WHEN 'heifers' THEN 'heifers'
    WHEN 'bulls' THEN 'bulls'
    WHEN 'calves' THEN 'calves'
    WHEN 'steers' THEN 'steers'
    WHEN 'stockers' THEN 'stockers'
    ELSE NULL
  END;
$$;

CREATE FUNCTION public._cattle_group_counts(p_group public.cattle_groups)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'cows', p_group.cows, 'heifers', p_group.heifers, 'bulls', p_group.bulls,
    'calves', p_group.calves, 'steers', p_group.steers, 'stockers', p_group.stockers
  );
$$;

-- Backfill before the trigger exists: each group's count goes to its own class.
UPDATE public.cattle_groups
SET cows = CASE WHEN class IN ('cows', 'mixed') THEN head_count ELSE 0 END,
    heifers = CASE WHEN class = 'replacement_heifers' THEN head_count ELSE 0 END,
    bulls = CASE WHEN class = 'bulls' THEN head_count ELSE 0 END,
    calves = CASE WHEN class = 'calves' THEN head_count ELSE 0 END,
    stockers = CASE WHEN class = 'stockers' THEN head_count ELSE 0 END;

-- b. Keep head_count equal to the sum -------------------------------------------
CREATE FUNCTION public.sync_cattle_class_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_counts jsonb;
  v_old jsonb;
  v_target text;
  v_diff integer;
  v_take integer;
  v_have integer;
  v_col text;
  v_sum integer;
BEGIN
  v_counts := public._cattle_group_counts(NEW);
  v_sum := NEW.cows + NEW.heifers + NEW.bulls + NEW.calves + NEW.steers + NEW.stockers;
  v_target := coalesce(public._cattle_count_column(NEW.class), 'cows');

  IF TG_OP = 'INSERT' THEN
    IF v_sum = 0 AND NEW.head_count > 0 THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(v_target, NEW.head_count));
    END IF;
  ELSE
    v_old := public._cattle_group_counts(OLD);
    IF v_counts = v_old AND NEW.head_count IS DISTINCT FROM OLD.head_count THEN
      -- Only the total changed: an older client, an older RPC replay, or a
      -- backup without counts. Put the difference on the group's own class;
      -- a decrease that class cannot cover comes off the others in order.
      v_diff := coalesce(NEW.head_count, 0) - OLD.head_count;
      IF v_diff > 0 THEN
        v_counts := jsonb_set(v_counts, ARRAY[v_target], to_jsonb((v_counts->>v_target)::integer + v_diff));
      ELSE
        v_diff := -v_diff;
        FOREACH v_col IN ARRAY ARRAY[v_target, 'calves', 'steers', 'stockers', 'heifers', 'cows', 'bulls'] LOOP
          EXIT WHEN v_diff = 0;
          v_have := (v_counts->>v_col)::integer;
          v_take := least(v_have, v_diff);
          v_counts := jsonb_set(v_counts, ARRAY[v_col], to_jsonb(v_have - v_take));
          v_diff := v_diff - v_take;
        END LOOP;
      END IF;
      NEW := jsonb_populate_record(NEW, v_counts);
    END IF;
  END IF;

  NEW.head_count := NEW.cows + NEW.heifers + NEW.bulls + NEW.calves + NEW.steers + NEW.stockers;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cattle_groups_sync_counts
  BEFORE INSERT OR UPDATE ON public.cattle_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_cattle_class_counts();

-- c. Event class, calf sex, reclass ----------------------------------------------
ALTER TABLE public.cattle_events
  ADD COLUMN cattle_class text CHECK (
    cattle_class IS NULL OR cattle_class IN ('cows', 'heifers', 'bulls', 'calves', 'steers', 'stockers')
  ),
  ADD COLUMN to_class text CHECK (
    to_class IS NULL OR to_class IN ('cows', 'heifers', 'bulls', 'calves', 'steers', 'stockers')
  ),
  ADD COLUMN class_head integer CHECK (class_head IS NULL OR class_head > 0),
  ADD COLUMN calf_sex text CHECK (calf_sex IS NULL OR calf_sex IN ('heifer', 'steer', 'bull'));

ALTER TABLE public.cattle_events DROP CONSTRAINT cattle_events_event_type_check;
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_event_type_check CHECK (event_type IN (
  'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed', 'reclass'
));
ALTER TABLE public.cattle_events DROP CONSTRAINT cattle_events_delta_matches_type;
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_delta_matches_type CHECK (
  (event_type IN ('calving', 'head_added') AND head_delta > 0)
  OR (event_type IN ('death', 'head_removed') AND head_delta < 0)
  OR (event_type IN ('weaning', 'working', 'preg_check', 'reclass') AND head_delta = 0)
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_reclass_shape CHECK (
  (event_type = 'reclass'
    AND cattle_class IS NOT NULL AND to_class IS NOT NULL
    AND cattle_class <> to_class AND class_head IS NOT NULL)
  OR (event_type <> 'reclass' AND to_class IS NULL AND class_head IS NULL)
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_calf_sex_calving CHECK (
  calf_sex IS NULL OR event_type = 'calving'
);

-- Existing head-changing events changed their group's own class.
SELECT set_config('acreledger.cattle_rpc', 'on', true);
UPDATE public.cattle_events e
SET cattle_class = CASE WHEN e.event_type = 'calving' THEN 'calves'
                        ELSE coalesce(public._cattle_count_column(g.class), 'cows') END
FROM public.cattle_groups g
WHERE g.id = e.group_id AND g.farm_id = e.farm_id AND e.head_delta <> 0;
SELECT set_config('acreledger.cattle_rpc', 'off', true);

-- d. RPCs -------------------------------------------------------------------------
DROP FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text);

CREATE FUNCTION public.log_cattle_event(
  p_farm_id uuid,
  p_event_id uuid,
  p_group_id uuid,
  p_event_type text,
  p_event_date date,
  p_head_delta integer,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_to_class text DEFAULT NULL,
  p_class_head integer DEFAULT NULL,
  p_calf_sex text DEFAULT NULL
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
  v_class text := nullif(btrim(p_class), '');
  v_to_class text := nullif(btrim(p_to_class), '');
  v_calf_sex text := nullif(btrim(p_calf_sex), '');
  v_have integer;
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
    'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed', 'reclass'
  ) THEN
    RAISE EXCEPTION 'Unknown cattle event type' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (p_event_type IN ('calving', 'head_added') AND p_head_delta > 0)
    OR (p_event_type IN ('death', 'head_removed') AND p_head_delta < 0)
    OR (p_event_type IN ('weaning', 'working', 'preg_check', 'reclass') AND p_head_delta = 0)
  ) THEN
    RAISE EXCEPTION 'Head-count change does not match the cattle event type'
      USING ERRCODE = '23514';
  END IF;
  IF p_event_type = 'head_removed'
     AND (v_reason IS NULL OR v_reason NOT IN ('shipped', 'moved_to_another_group')) THEN
    RAISE EXCEPTION 'Head removed requires a valid reason' USING ERRCODE = '23514';
  END IF;
  IF v_class IS NOT NULL AND public._cattle_count_column(v_class) IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'Unknown cattle class' USING ERRCODE = '23514';
  END IF;
  IF p_event_type = 'reclass' THEN
    IF v_class IS NULL OR v_to_class IS NULL OR v_class = v_to_class
       OR public._cattle_count_column(v_to_class) IS DISTINCT FROM v_to_class
       OR p_class_head IS NULL OR p_class_head <= 0 THEN
      RAISE EXCEPTION 'Reclass needs two different classes and a head count'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_to_class IS NOT NULL OR p_class_head IS NOT NULL THEN
    RAISE EXCEPTION 'Only a reclass event moves head between classes' USING ERRCODE = '23514';
  END IF;
  IF v_calf_sex IS NOT NULL AND (p_event_type <> 'calving' OR v_calf_sex NOT IN ('heifer', 'steer', 'bull')) THEN
    RAISE EXCEPTION 'Calf sex applies to calving only' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = p_group_id AND farm_id = p_farm_id;
  -- Which class the head change hits. Calving adds calves; an older client that
  -- sends no class changes the group's own class.
  IF p_event_type = 'calving' THEN
    v_class := 'calves';
  ELSIF p_head_delta <> 0 AND v_class IS NULL THEN
    v_class := coalesce(public._cattle_count_column(v_group.class), 'cows');
  ELSIF p_head_delta = 0 AND p_event_type <> 'reclass' THEN
    v_class := NULL;
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
       OR v_existing.cattle_class IS DISTINCT FROM v_class
       OR v_existing.to_class IS DISTINCT FROM v_to_class
       OR v_existing.class_head IS DISTINCT FROM p_class_head
       OR v_existing.calf_sex IS DISTINCT FROM v_calf_sex
       OR v_existing.transfer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Event id already belongs to a different cattle event'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'event_id', p_event_id,
      'group_id', p_group_id,
      'head_count', v_group.head_count,
      'counts', public._cattle_group_counts(v_group),
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

  IF v_class IS NOT NULL THEN
    v_have := (public._cattle_group_counts(v_group)->>v_class)::integer;
    IF v_have + p_head_delta < 0 OR (p_event_type = 'reclass' AND v_have < p_class_head) THEN
      RAISE EXCEPTION 'Cattle event would make a class count negative'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes,
    cattle_class, to_class, class_head, calf_sex
  ) VALUES (
    p_event_id, p_farm_id, p_group_id, p_event_type, p_event_date,
    p_head_delta, v_reason, v_notes, v_class, v_to_class, p_class_head, v_calf_sex
  );
  IF p_event_type = 'reclass' THEN
    EXECUTE format(
      'UPDATE public.cattle_groups SET %1$I = %1$I - $1, %2$I = %2$I + $1 WHERE id = $2 AND farm_id = $3',
      v_class, v_to_class
    ) USING p_class_head, p_group_id, p_farm_id;
  ELSIF p_head_delta <> 0 THEN
    EXECUTE format(
      'UPDATE public.cattle_groups SET %1$I = %1$I + $1 WHERE id = $2 AND farm_id = $3',
      v_class
    ) USING p_head_delta, p_group_id, p_farm_id;
  END IF;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = p_group_id AND farm_id = p_farm_id;
  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'group_id', p_group_id,
    'head_count', v_group.head_count,
    'counts', public._cattle_group_counts(v_group),
    'already_applied', false
  );
END;
$$;

DROP FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text);

CREATE FUNCTION public.transfer_cattle_head(
  p_farm_id uuid,
  p_from_event_id uuid,
  p_to_event_id uuid,
  p_from_group_id uuid,
  p_to_group_id uuid,
  p_head integer,
  p_event_date date,
  p_notes text DEFAULT NULL,
  p_class text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
  v_class text := nullif(btrim(p_class), '');
  v_from_group public.cattle_groups%ROWTYPE;
  v_to_group public.cattle_groups%ROWTYPE;
  v_from public.cattle_events%ROWTYPE;
  v_to public.cattle_events%ROWTYPE;
  v_has_from boolean;
  v_has_to boolean;
  v_locked integer;
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
  IF v_class IS NOT NULL AND public._cattle_count_column(v_class) IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'Unknown cattle class' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_from_group FROM public.cattle_groups
  WHERE id = p_from_group_id AND farm_id = p_farm_id;
  -- An older client sends no class: move the from-group's own class.
  v_class := coalesce(v_class, public._cattle_count_column(v_from_group.class), 'cows');

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
       OR v_from.cattle_class IS DISTINCT FROM v_class
       OR v_to.group_id IS DISTINCT FROM p_to_group_id
       OR v_to.event_type IS DISTINCT FROM 'head_added'
       OR v_to.event_date IS DISTINCT FROM p_event_date
       OR v_to.head_delta IS DISTINCT FROM p_head
       OR v_to.reason IS NOT NULL
       OR v_to.notes IS DISTINCT FROM v_notes
       OR v_to.transfer_id IS DISTINCT FROM p_from_event_id
       OR v_to.cattle_class IS DISTINCT FROM v_class THEN
      RAISE EXCEPTION 'Event id already belongs to a different cattle event'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_to_group FROM public.cattle_groups
    WHERE id = p_to_group_id AND farm_id = p_farm_id;
    RETURN jsonb_build_object(
      'transfer_id', p_from_event_id,
      'from_group_id', p_from_group_id,
      'to_group_id', p_to_group_id,
      'from_head_count', v_from_group.head_count,
      'to_head_count', v_to_group.head_count,
      'from_counts', public._cattle_group_counts(v_from_group),
      'to_counts', public._cattle_group_counts(v_to_group),
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

  SELECT * INTO v_from_group FROM public.cattle_groups
  WHERE id = p_from_group_id AND farm_id = p_farm_id;
  IF (public._cattle_group_counts(v_from_group)->>v_class)::integer < p_head THEN
    RAISE EXCEPTION 'Transfer would make a class count negative'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes, transfer_id, cattle_class
  ) VALUES (
    p_from_event_id, p_farm_id, p_from_group_id, 'head_removed', p_event_date,
    -p_head, 'moved_to_another_group', v_notes, p_from_event_id, v_class
  );
  INSERT INTO public.cattle_events (
    id, farm_id, group_id, event_type, event_date, head_delta, reason, notes, transfer_id, cattle_class
  ) VALUES (
    p_to_event_id, p_farm_id, p_to_group_id, 'head_added', p_event_date,
    p_head, NULL, v_notes, p_from_event_id, v_class
  );
  EXECUTE format('UPDATE public.cattle_groups SET %1$I = %1$I - $1 WHERE id = $2 AND farm_id = $3', v_class)
    USING p_head, p_from_group_id, p_farm_id;
  EXECUTE format('UPDATE public.cattle_groups SET %1$I = %1$I + $1 WHERE id = $2 AND farm_id = $3', v_class)
    USING p_head, p_to_group_id, p_farm_id;

  SELECT * INTO v_from_group FROM public.cattle_groups
  WHERE id = p_from_group_id AND farm_id = p_farm_id;
  SELECT * INTO v_to_group FROM public.cattle_groups
  WHERE id = p_to_group_id AND farm_id = p_farm_id;
  RETURN jsonb_build_object(
    'transfer_id', p_from_event_id,
    'from_group_id', p_from_group_id,
    'to_group_id', p_to_group_id,
    'from_head_count', v_from_group.head_count,
    'to_head_count', v_to_group.head_count,
    'from_counts', public._cattle_group_counts(v_from_group),
    'to_counts', public._cattle_group_counts(v_to_group),
    'already_applied', false
  );
END;
$$;

-- e. Deleting an event reverses it on the class it changed --------------------------
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
  v_class text;
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
  -- itself, on the class it changed. Counts floor at zero and the delete is
  -- never refused for that.
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

    IF v_half.event_type = 'reclass' THEN
      -- Give back what is still there: never more than the to-class now holds.
      EXECUTE format(
        'UPDATE public.cattle_groups
         SET %1$I = %1$I + least(%2$I, $1), %2$I = %2$I - least(%2$I, $1)
         WHERE id = $2 AND farm_id = $3 AND deleted_at IS NULL',
        v_half.cattle_class, v_half.to_class
      ) USING v_half.class_head, v_half.group_id, p_farm_id;
    ELSIF v_half.head_delta <> 0 THEN
      SELECT coalesce(v_half.cattle_class, public._cattle_count_column(g.class), 'cows')
      INTO v_class
      FROM public.cattle_groups g
      WHERE g.id = v_half.group_id AND g.farm_id = p_farm_id;
      EXECUTE format(
        'UPDATE public.cattle_groups SET %1$I = greatest(%1$I - $1, 0)
         WHERE id = $2 AND farm_id = $3 AND deleted_at IS NULL',
        v_class
      ) USING v_half.head_delta, v_half.group_id, p_farm_id;
    END IF;
    v_events := v_events + 1;
  END LOOP;

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = v_event.group_id AND farm_id = p_farm_id;

  RETURN jsonb_build_object(
    'row_type', p_row_type,
    'row_id', p_row_id,
    'head_count', v_group.head_count,
    'counts', public._cattle_group_counts(v_group),
    'events', v_events,
    'transfer_id', v_event.transfer_id,
    'already_applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public._cattle_count_column(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cattle_group_counts(public.cattle_groups) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_cattle_class_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_cattle_row(uuid, text, uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.cattle_groups.head_count IS
  'Total head. Always the sum of cows, heifers, bulls, calves, steers and stockers (sync_cattle_class_counts).';
COMMENT ON COLUMN public.cattle_events.cattle_class IS
  'The class whose count this event changed (the from-class for a reclass). NULL when the event changes no head.';
COMMENT ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text) IS
  'Idempotently records one cattle event and applies its head change to one class (or moves head between classes for reclass) atomically.';
COMMENT ON FUNCTION public.transfer_cattle_head(uuid, uuid, uuid, uuid, uuid, integer, date, text, text) IS
  'Atomically moves head of one class between two groups as one head_removed and one head_added event sharing a transfer_id; idempotent on both event ids.';

COMMIT;
