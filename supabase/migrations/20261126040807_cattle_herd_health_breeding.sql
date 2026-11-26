BEGIN;

-- Herd health and breeding (2026-11-25). Builds on mixed herds.
--
--   a. cattle_treatments: one row per treatment or vaccine given to a herd
--      (product, dose, route, head, withdrawal). RLS select only; writes go
--      through log_cattle_treatment / delete_cattle_treatment.
--   b. cattle_events gains preg-check results (bred / open / not checked),
--      bull turnout and pull events (bull_in with the females exposed,
--      bull_out) and weaning numbers (head weaned, average weight).
--   c. log_cattle_event takes the new optional arguments; the old argument
--      lists still resolve (named arguments, new ones default NULL).
--   d. A deleted herd takes its treatments with it.
--   e. restore_farm_backup restores cattle_treatments.

-- a. Treatments -----------------------------------------------------------------
CREATE TABLE public.cattle_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  treated_on date NOT NULL,
  product text NOT NULL CHECK (btrim(product) <> '' AND char_length(product) <= 120),
  kind text NOT NULL CHECK (kind IN ('vaccine', 'dewormer', 'antibiotic', 'other')),
  cattle_class text CHECK (
    cattle_class IS NULL OR cattle_class IN ('cows', 'heifers', 'bulls', 'calves', 'steers', 'stockers')
  ),
  head_treated integer NOT NULL CHECK (head_treated > 0),
  dose numeric(8,2) NOT NULL CHECK (dose > 0),
  dose_unit text NOT NULL CHECK (dose_unit IN ('mL', 'cc', 'mg', 'g', 'oz', 'tablet', 'bolus')),
  dose_basis text NOT NULL DEFAULT 'per_head' CHECK (dose_basis IN ('per_head', 'per_100_lb')),
  route text NOT NULL CHECK (route IN ('SQ', 'IM', 'IV', 'oral', 'pour_on', 'intranasal', 'topical', 'implant')),
  withdrawal_days integer NOT NULL DEFAULT 0 CHECK (withdrawal_days BETWEEN 0 AND 365),
  withdrawal_until date GENERATED ALWAYS AS (treated_on + withdrawal_days) STORED,
  lot_number text CHECK (lot_number IS NULL OR char_length(lot_number) <= 60),
  given_by text CHECK (given_by IS NULL OR char_length(given_by) <= 80),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cattle_treatments_farm_id_id_key UNIQUE (farm_id, id),
  CONSTRAINT cattle_treatments_farm_group_fk
    FOREIGN KEY (farm_id, group_id)
    REFERENCES public.cattle_groups(farm_id, id)
);

CREATE INDEX cattle_treatments_farm_deleted_idx
  ON public.cattle_treatments (farm_id, deleted_at);
CREATE INDEX cattle_treatments_group_date_idx
  ON public.cattle_treatments (farm_id, group_id, treated_on DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER cattle_treatments_set_updated_at
  BEFORE UPDATE ON public.cattle_treatments
  FOR EACH ROW EXECUTE FUNCTION public.set_cattle_updated_at();
CREATE TRIGGER cattle_treatments_rpc_columns
  BEFORE INSERT OR UPDATE ON public.cattle_treatments
  FOR EACH ROW EXECUTE FUNCTION public.guard_cattle_rpc_columns();

ALTER TABLE public.cattle_treatments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cattle_treatments_select ON public.cattle_treatments
  FOR SELECT TO authenticated USING (
    farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

REVOKE ALL ON TABLE public.cattle_treatments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cattle_treatments TO authenticated;
GRANT ALL ON TABLE public.cattle_treatments TO service_role;

-- b. Preg check, bull turnout, weaning numbers ------------------------------------
ALTER TABLE public.cattle_events
  ADD COLUMN bred_count integer CHECK (bred_count IS NULL OR bred_count >= 0),
  ADD COLUMN open_count integer CHECK (open_count IS NULL OR open_count >= 0),
  ADD COLUMN not_checked_count integer CHECK (not_checked_count IS NULL OR not_checked_count >= 0),
  ADD COLUMN exposed_count integer CHECK (exposed_count IS NULL OR exposed_count > 0),
  ADD COLUMN head_weaned integer CHECK (head_weaned IS NULL OR head_weaned > 0),
  ADD COLUMN avg_weight numeric(7,1) CHECK (avg_weight IS NULL OR avg_weight > 0);

ALTER TABLE public.cattle_events DROP CONSTRAINT cattle_events_event_type_check;
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_event_type_check CHECK (event_type IN (
  'calving', 'weaning', 'working', 'preg_check', 'death', 'head_added', 'head_removed', 'reclass',
  'bull_in', 'bull_out'
));
ALTER TABLE public.cattle_events DROP CONSTRAINT cattle_events_delta_matches_type;
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_delta_matches_type CHECK (
  (event_type IN ('calving', 'head_added') AND head_delta > 0)
  OR (event_type IN ('death', 'head_removed') AND head_delta < 0)
  OR (event_type IN ('weaning', 'working', 'preg_check', 'reclass', 'bull_in', 'bull_out') AND head_delta = 0)
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_preg_shape CHECK (
  (bred_count IS NULL AND open_count IS NULL AND not_checked_count IS NULL)
  OR (
    event_type = 'preg_check'
    AND bred_count IS NOT NULL AND open_count IS NOT NULL AND not_checked_count IS NOT NULL
    AND bred_count + open_count + not_checked_count > 0
  )
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_exposed_shape CHECK (
  exposed_count IS NULL OR event_type = 'bull_in'
);
ALTER TABLE public.cattle_events ADD CONSTRAINT cattle_events_weaning_shape CHECK (
  (head_weaned IS NULL AND avg_weight IS NULL)
  OR (event_type = 'weaning' AND head_weaned IS NOT NULL)
);

-- c. log_cattle_event with the new arguments ---------------------------------------
DROP FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text);

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
  IF p_head_weaned IS NOT NULL OR p_avg_weight IS NOT NULL THEN
    IF p_event_type <> 'weaning' OR p_head_weaned IS NULL OR p_head_weaned <= 0
       OR (p_avg_weight IS NOT NULL AND coalesce(v_avg, 0) <= 0) THEN
      RAISE EXCEPTION 'Weaning numbers need head weaned, and a weight above zero'
        USING ERRCODE = '23514';
    END IF;
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

-- Treatment RPCs --------------------------------------------------------------------
CREATE FUNCTION public.log_cattle_treatment(
  p_farm_id uuid,
  p_treatment_id uuid,
  p_group_id uuid,
  p_treated_on date,
  p_product text,
  p_kind text,
  p_head_treated integer,
  p_dose numeric,
  p_dose_unit text,
  p_route text,
  p_withdrawal_days integer DEFAULT 0,
  p_class text DEFAULT NULL,
  p_dose_basis text DEFAULT 'per_head',
  p_lot_number text DEFAULT NULL,
  p_given_by text DEFAULT NULL,
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
  v_existing public.cattle_treatments%ROWTYPE;
  v_product text := btrim(p_product);
  v_class text := nullif(btrim(p_class), '');
  v_basis text := coalesce(nullif(btrim(p_dose_basis), ''), 'per_head');
  v_lot text := nullif(btrim(p_lot_number), '');
  v_by text := nullif(btrim(p_given_by), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_days integer := coalesce(p_withdrawal_days, 0);
  v_dose numeric(8,2) := round(p_dose, 2);
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
  IF p_treatment_id IS NULL OR p_group_id IS NULL THEN
    RAISE EXCEPTION 'A treatment needs an id and a herd' USING ERRCODE = '23502';
  END IF;
  IF p_treated_on IS NULL OR p_treated_on > current_date + 1 THEN
    RAISE EXCEPTION 'Treatment date cannot be in the future' USING ERRCODE = '23514';
  END IF;
  IF v_product IS NULL OR v_product = '' OR char_length(v_product) > 120 THEN
    RAISE EXCEPTION 'Treatment needs a product name' USING ERRCODE = '23514';
  END IF;
  IF p_kind NOT IN ('vaccine', 'dewormer', 'antibiotic', 'other') THEN
    RAISE EXCEPTION 'Unknown treatment kind' USING ERRCODE = '23514';
  END IF;
  IF p_head_treated IS NULL OR p_head_treated <= 0 THEN
    RAISE EXCEPTION 'Head treated must be a positive whole number' USING ERRCODE = '23514';
  END IF;
  IF v_dose IS NULL OR v_dose <= 0 THEN
    RAISE EXCEPTION 'Dose must be above zero' USING ERRCODE = '23514';
  END IF;
  IF p_dose_unit NOT IN ('mL', 'cc', 'mg', 'g', 'oz', 'tablet', 'bolus') THEN
    RAISE EXCEPTION 'Unknown dose unit' USING ERRCODE = '23514';
  END IF;
  IF v_basis NOT IN ('per_head', 'per_100_lb') THEN
    RAISE EXCEPTION 'Unknown dose basis' USING ERRCODE = '23514';
  END IF;
  IF p_route NOT IN ('SQ', 'IM', 'IV', 'oral', 'pour_on', 'intranasal', 'topical', 'implant') THEN
    RAISE EXCEPTION 'Unknown treatment route' USING ERRCODE = '23514';
  END IF;
  IF v_days < 0 OR v_days > 365 THEN
    RAISE EXCEPTION 'Withdrawal must be 0 to 365 days' USING ERRCODE = '23514';
  END IF;
  IF v_class IS NOT NULL AND public._cattle_count_column(v_class) IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'Unknown cattle class' USING ERRCODE = '23514';
  END IF;
  IF (v_lot IS NOT NULL AND char_length(v_lot) > 60) OR (v_by IS NOT NULL AND char_length(v_by) > 80) THEN
    RAISE EXCEPTION 'Lot number or name is too long' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.cattle_treatments
  WHERE id = p_treatment_id AND farm_id = p_farm_id;
  IF FOUND THEN
    IF v_existing.group_id IS DISTINCT FROM p_group_id
       OR v_existing.treated_on IS DISTINCT FROM p_treated_on
       OR v_existing.product IS DISTINCT FROM v_product
       OR v_existing.kind IS DISTINCT FROM p_kind
       OR v_existing.cattle_class IS DISTINCT FROM v_class
       OR v_existing.head_treated IS DISTINCT FROM p_head_treated
       OR v_existing.dose IS DISTINCT FROM v_dose
       OR v_existing.dose_unit IS DISTINCT FROM p_dose_unit
       OR v_existing.dose_basis IS DISTINCT FROM v_basis
       OR v_existing.route IS DISTINCT FROM p_route
       OR v_existing.withdrawal_days IS DISTINCT FROM v_days
       OR v_existing.lot_number IS DISTINCT FROM v_lot
       OR v_existing.given_by IS DISTINCT FROM v_by
       OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Treatment id already belongs to a different treatment'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'treatment_id', p_treatment_id,
      'group_id', p_group_id,
      'withdrawal_until', v_existing.withdrawal_until,
      'already_applied', true
    );
  END IF;

  -- Pro feature, checked after the already-applied return like the other
  -- cattle writes: replaying a saved treatment never parks.
  PERFORM public.assert_premium(p_farm_id, 'cattle_events');

  SELECT * INTO v_group
  FROM public.cattle_groups
  WHERE id = p_group_id
    AND farm_id = p_farm_id
    AND deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cattle group not found' USING ERRCODE = 'P0002';
  END IF;

  v_have := CASE
    WHEN v_class IS NULL THEN v_group.head_count
    ELSE (public._cattle_group_counts(v_group)->>v_class)::integer
  END;
  IF p_head_treated > v_have THEN
    RAISE EXCEPTION 'Head treated is more than the herd holds' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  INSERT INTO public.cattle_treatments (
    id, farm_id, group_id, treated_on, product, kind, cattle_class, head_treated,
    dose, dose_unit, dose_basis, route, withdrawal_days, lot_number, given_by, notes
  ) VALUES (
    p_treatment_id, p_farm_id, p_group_id, p_treated_on, v_product, p_kind, v_class, p_head_treated,
    v_dose, p_dose_unit, v_basis, p_route, v_days, v_lot, v_by, v_notes
  );

  RETURN jsonb_build_object(
    'treatment_id', p_treatment_id,
    'group_id', p_group_id,
    'withdrawal_until', p_treated_on + v_days,
    'already_applied', false
  );
END;
$$;

CREATE FUNCTION public.delete_cattle_treatment(
  p_farm_id uuid,
  p_treatment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_farm_id uuid;
  v_row public.cattle_treatments%ROWTYPE;
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

  SELECT * INTO v_row
  FROM public.cattle_treatments
  WHERE id = p_treatment_id AND farm_id = p_farm_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Treatment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('treatment_id', p_treatment_id, 'already_applied', true);
  END IF;

  PERFORM set_config('acreledger.cattle_rpc', 'on', true);
  UPDATE public.cattle_treatments
  SET deleted_at = now()
  WHERE id = p_treatment_id AND farm_id = p_farm_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('treatment_id', p_treatment_id, 'already_applied', false);
END;
$$;

-- d. A deleted herd takes its treatments with it ---------------------------------------
CREATE FUNCTION public.tombstone_cattle_treatments_with_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM set_config('acreledger.cattle_rpc', 'on', true);
    UPDATE public.cattle_treatments
    SET deleted_at = NEW.deleted_at
    WHERE farm_id = NEW.farm_id AND group_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cattle_groups_tombstone_treatments
  AFTER UPDATE OF deleted_at ON public.cattle_groups
  FOR EACH ROW EXECUTE FUNCTION public.tombstone_cattle_treatments_with_group();

-- e. Restore --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '120s'
AS $$
DECLARE
  v_farm_id uuid;
  v_result jsonb;
  v_groups jsonb := p_payload->'cattle_groups';
  v_group_name_conflicts integer := 0;
  v_counties jsonb := p_payload->'county_assignments';
  v_county_conflicts integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  SELECT farm_id INTO v_farm_id
  FROM public.profiles
  WHERE id = auth.uid();
  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'No farm selected for current user.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_premium(v_farm_id, 'backup_restore');
  PERFORM set_config('acreledger.restoring', 'on', true);
  PERFORM set_config('acreledger.cattle_rpc', 'on', true);

  -- A live group that is not in the payload keeps its name; an active restored
  -- group whose name collides with it is renamed with a suffix.
  IF jsonb_typeof(v_groups) = 'array' THEN
    WITH payload AS (
      SELECT item, ord
      FROM jsonb_array_elements(v_groups) WITH ORDINALITY AS t(item, ord)
    ),
    marked AS (
      SELECT
        item,
        ord,
        (item->>'deleted_at') IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.cattle_groups g
          WHERE g.farm_id = v_farm_id
            AND g.deleted_at IS NULL
            AND lower(btrim(g.name)) = lower(btrim(item->>'name'))
            AND g.id::text IS DISTINCT FROM item->>'id'
            AND NOT EXISTS (
              SELECT 1 FROM payload other WHERE other.item->>'id' = g.id::text
            )
        ) AS conflicts
      FROM payload
    )
    SELECT
      COALESCE(jsonb_agg(
        CASE WHEN conflicts
          THEN jsonb_set(
            item, '{name}',
            to_jsonb(public._cattle_restore_group_name(v_farm_id, item->>'name', p_payload->'cattle_groups')),
            true
          )
          ELSE item
        END
        ORDER BY ord
      ), '[]'::jsonb),
      count(*) FILTER (WHERE conflicts)
    INTO v_groups, v_group_name_conflicts
    FROM marked;
  END IF;

  v_result := public._restore_farm_backup_impl(p_payload, p_active_season);

  -- Park the name of every live group the payload is about to rewrite. Rows are
  -- upserted one at a time, so without this a name that moved from one payload
  -- group to another since the backup (old "Cows" deleted, "Heifers" renamed
  -- "Cows") hits the live-name unique index and aborts the whole farm restore.
  IF jsonb_typeof(v_groups) = 'array' THEN
    UPDATE public.cattle_groups g
    SET name = '__restoring__' || g.id::text
    WHERE g.farm_id = v_farm_id
      AND g.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_groups) AS t(item)
        WHERE item->>'id' = g.id::text
          AND item ? 'name'
      );
  END IF;
  v_result := v_result || jsonb_build_object(
    'cattle_groups', public._restore_table_for_farm('public.cattle_groups'::regclass, v_groups, v_farm_id),
    'cattle_moves', public._restore_table_for_farm('public.cattle_moves'::regclass, p_payload->'cattle_moves', v_farm_id),
    'cattle_events', public._restore_table_for_farm('public.cattle_events'::regclass, p_payload->'cattle_events', v_farm_id),
    'cattle_treatments', public._restore_table_for_farm('public.cattle_treatments'::regclass, p_payload->'cattle_treatments', v_farm_id),
    'cattle_group_name_conflicts', v_group_name_conflicts
  );

  -- County assignments (manual county splits included). Restored after the
  -- fields they reference. A live row for the same subject and county under a
  -- different id would hit county_assignments_live_unique and abort the whole
  -- restore, so it is retired first; the backup's row replaces it.
  IF jsonb_typeof(v_counties) = 'array' THEN
    WITH incoming AS (
      SELECT item->>'id' AS id, item->>'subject_type' AS subject_type, item->>'subject_key' AS subject_key,
             coalesce(item->>'county_fips', 'unresolved') AS county
      FROM jsonb_array_elements(v_counties) AS t(item)
      WHERE (item->>'deleted_at') IS NULL
    ),
    retired AS (
      UPDATE public.county_assignments c
      SET deleted_at = now()
      FROM incoming i
      WHERE c.farm_id = v_farm_id
        AND c.deleted_at IS NULL
        AND c.subject_type = i.subject_type
        AND c.subject_key = i.subject_key
        AND coalesce(c.county_fips, 'unresolved') = i.county
        AND c.id::text IS DISTINCT FROM i.id
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_counties) AS p(item) WHERE p.item->>'id' = c.id::text)
      RETURNING c.id
    )
    SELECT count(*) INTO v_county_conflicts FROM retired;
  END IF;
  v_result := v_result || jsonb_build_object(
    'county_assignments', public._restore_table_for_farm('public.county_assignments'::regclass, v_counties, v_farm_id),
    'county_assignment_conflicts', v_county_conflicts
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text, integer, integer, integer, integer, integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_cattle_treatment(uuid, uuid, uuid, date, text, text, integer, numeric, text, text, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_cattle_treatment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tombstone_cattle_treatments_with_group() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text, integer, integer, integer, integer, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_cattle_treatment(uuid, uuid, uuid, date, text, text, integer, numeric, text, text, integer, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_cattle_treatment(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated, service_role;

COMMENT ON TABLE public.cattle_treatments IS
  'Treatments and vaccines given to a herd. Written only by log_cattle_treatment; withdrawal_until = treated_on + withdrawal_days.';
COMMENT ON FUNCTION public.log_cattle_treatment(uuid, uuid, uuid, date, text, text, integer, numeric, text, text, integer, text, text, text, text, text) IS
  'Idempotently records one treatment for a herd (Pro). Head treated cannot exceed the class (or herd) count.';
COMMENT ON FUNCTION public.log_cattle_event(uuid, uuid, uuid, text, date, integer, text, text, text, text, integer, text, integer, integer, integer, integer, integer, numeric) IS
  'Idempotently records one cattle event and applies its head change to one class (or moves head between classes for reclass) atomically. Also stores preg check results, bull turnout exposure and weaning numbers.';

COMMIT;
