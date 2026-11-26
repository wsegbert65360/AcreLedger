-- Sales and deaths (2026-11-26). Builds on herd health and breeding.
--
--   a. A sale (head removed, shipped) may record an average weight, kept in
--      avg_weight with no head_weaned.
--   b. A death may record a cause in reason (illness, calving, weather,
--      predator, unknown, other); head removed keeps its own two reasons.
--   c. log_cattle_event validates both. Same argument list, so older builds
--      and the existing grants are unchanged.

ALTER TABLE public.cattle_events DROP CONSTRAINT cattle_events_weaning_shape;
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_weaning_shape CHECK (
  (head_weaned IS NULL AND avg_weight IS NULL)
  OR (event_type = 'weaning' AND head_weaned IS NOT NULL)
  OR (event_type = 'head_removed' AND reason = 'shipped' AND head_weaned IS NULL)
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_death_cause CHECK (
  event_type <> 'death'
  OR reason IS NULL
  OR reason IN ('illness', 'calving', 'weather', 'predator', 'unknown', 'other')
);
CREATE OR REPLACE FUNCTION public.log_cattle_event(
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
  p_calf_sex text DEFAULT NULL,
  p_bred integer DEFAULT NULL,
  p_open integer DEFAULT NULL,
  p_not_checked integer DEFAULT NULL,
  p_exposed integer DEFAULT NULL,
  p_head_weaned integer DEFAULT NULL,
  p_avg_weight numeric DEFAULT NULL
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
  v_bred integer;
  v_open integer;
  v_not_checked integer;
  v_avg numeric(7,1) := round(p_avg_weight, 1);
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
    'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed', 'reclass',
    'bull_in', 'bull_out'
  ) THEN
    RAISE EXCEPTION 'Unknown cattle event type' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (p_event_type IN ('calving', 'head_added') AND p_head_delta > 0)
    OR (p_event_type IN ('death', 'head_removed') AND p_head_delta < 0)
    OR (p_event_type IN ('weaning', 'working', 'preg_check', 'reclass', 'bull_in', 'bull_out') AND p_head_delta = 0)
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

  -- Preg check results: bred + open + not checked, all whole numbers, at least one head.
  IF p_bred IS NOT NULL OR p_open IS NOT NULL OR p_not_checked IS NOT NULL THEN
    v_bred := coalesce(p_bred, 0);
    v_open := coalesce(p_open, 0);
    v_not_checked := coalesce(p_not_checked, 0);
    IF p_event_type <> 'preg_check' THEN
      RAISE EXCEPTION 'Preg check counts apply to a preg check only' USING ERRCODE = '23514';
    END IF;
    IF v_bred < 0 OR v_open < 0 OR v_not_checked < 0 OR v_bred + v_open + v_not_checked = 0 THEN
      RAISE EXCEPTION 'Preg check counts must be whole numbers with at least one head'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_exposed IS NOT NULL AND (p_event_type <> 'bull_in' OR p_exposed <= 0) THEN
    RAISE EXCEPTION 'Females exposed applies to bulls in, and must be a positive number'
      USING ERRCODE = '23514';
  END IF;
  -- Weaning takes head weaned and an optional average weight. A sale (head removed,
  -- shipped) takes an average weight alone. Nothing else carries either number.
  IF p_head_weaned IS NOT NULL OR p_avg_weight IS NOT NULL THEN
    IF p_event_type = 'weaning' THEN
      IF p_head_weaned IS NULL OR p_head_weaned <= 0
         OR (p_avg_weight IS NOT NULL AND coalesce(v_avg, 0) <= 0) THEN
        RAISE EXCEPTION 'Weaning numbers need head weaned, and a weight above zero'
          USING ERRCODE = '23514';
      END IF;
    ELSIF p_event_type = 'head_removed' AND v_reason = 'shipped' THEN
      IF p_head_weaned IS NOT NULL OR coalesce(v_avg, 0) <= 0 THEN
        RAISE EXCEPTION 'A sale takes an average weight above zero' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Weights apply to weaning and sales only' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_event_type = 'death' AND v_reason IS NOT NULL
     AND v_reason NOT IN ('illness', 'calving', 'weather', 'predator', 'unknown', 'other') THEN
    RAISE EXCEPTION 'Unknown cause of death' USING ERRCODE = '23514';
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
       OR v_existing.bred_count IS DISTINCT FROM v_bred
       OR v_existing.open_count IS DISTINCT FROM v_open
       OR v_existing.not_checked_count IS DISTINCT FROM v_not_checked
       OR v_existing.exposed_count IS DISTINCT FROM p_exposed
       OR v_existing.head_weaned IS DISTINCT FROM p_head_weaned
       OR v_existing.avg_weight IS DISTINCT FROM v_avg
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
    cattle_class, to_class, class_head, calf_sex,
    bred_count, open_count, not_checked_count, exposed_count, head_weaned, avg_weight
  ) VALUES (
    p_event_id, p_farm_id, p_group_id, p_event_type, p_event_date,
    p_head_delta, v_reason, v_notes, v_class, v_to_class, p_class_head, v_calf_sex,
    v_bred, v_open, v_not_checked, p_exposed, p_head_weaned, v_avg
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
