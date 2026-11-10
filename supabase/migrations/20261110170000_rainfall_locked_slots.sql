-- Lock a free farm's two rainfall fields.
--
-- 20261107040000 picked the two oldest active fields with coordinates on every read
-- (created_at NULLS LAST, id). That was not a lock: authenticated has table-level
-- UPDATE on public.fields, so a client can rewrite created_at, and clearing lat/lng
-- on a slot field made the next field the new "oldest".
--
-- Slots are stored. Backfill takes the two oldest eligible fields. After that, an
-- empty slot is filled with the next oldest eligible field that does not already
-- hold one. Nothing here deletes rainfall history or field rows.

-- PostgreSQL cannot REVOKE UPDATE (created_at) while a table-level GRANT UPDATE
-- stands (20260629151900 grants UPDATE on public.fields to authenticated). The
-- BEFORE trigger below is the enforcement. Clients cannot change created_at.
-- service_role / other auth.uid() IS NULL callers can. A restore INSERT may keep
-- the backup's created_at only when the transaction-local GUC acreledger.restoring
-- is 'on'. PostgREST does not expose set_config, so a client cannot set that GUC.

CREATE TABLE IF NOT EXISTS public.farm_rainfall_slots (
  farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, slot),
  UNIQUE (field_id)
);

ALTER TABLE public.farm_rainfall_slots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.farm_rainfall_slots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.farm_rainfall_slots TO service_role;
-- New public tables must not leave MAINTAIN with API roles. GRANT ALL above is
-- service_role only; restate the revoke so a default privilege cannot put it back.
REVOKE MAINTAIN ON TABLE public.farm_rainfall_slots FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.farm_rainfall_slots IS
  'Locked rainfall slots (1 and 2) per farm. Clients cannot read or write this table; they use farm_rainfall_field_ids. service_role only.';

COMMENT ON COLUMN public.fields.created_at IS
  'Age used when a rainfall slot is first filled. Clients cannot change it: table-level UPDATE cannot be narrowed with REVOKE UPDATE (created_at), so lock_field_created_at enforces it. auth.uid() IS NULL (service role) may write it. Restore INSERTs keep the backup value only while acreledger.restoring is on.';

CREATE OR REPLACE FUNCTION public.lock_field_created_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT. A clock a few minutes off is accepted. Anything else becomes now(),
  -- except a server restore, which must keep the field's original age.
  IF auth.uid() IS NOT NULL
     AND pg_catalog.current_setting('acreledger.restoring', true) IS DISTINCT FROM 'on'
     AND (
       NEW.created_at IS NULL
       OR NEW.created_at > pg_catalog.now() + interval '5 minutes'
       OR NEW.created_at < pg_catalog.now() - interval '5 minutes'
     )
  THEN
    NEW.created_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_field_created_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lock_field_created_at ON public.fields;
CREATE TRIGGER lock_field_created_at
  BEFORE INSERT OR UPDATE ON public.fields
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_field_created_at();

-- Fills empty slots 1 then 2. Does not evict a field that already holds a slot.
-- Caller holds the per-farm advisory lock (this function takes it too; xact locks stack).
CREATE OR REPLACE FUNCTION public._fill_open_rainfall_slots(p_farm_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_farm_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rainfall_slots:' || p_farm_id::text));

  INSERT INTO public.farm_rainfall_slots (farm_id, slot, field_id)
  SELECT p_farm_id, open.slot, pick.id
  FROM (
    SELECT gs.slot, row_number() OVER (ORDER BY gs.slot) AS ord
    FROM (VALUES (1::smallint), (2::smallint)) AS gs(slot)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.farm_rainfall_slots s
      WHERE s.farm_id = p_farm_id AND s.slot = gs.slot
    )
  ) open
  JOIN LATERAL (
    SELECT f.id
    FROM public.fields f
    WHERE f.farm_id = p_farm_id
      AND f.deleted_at IS NULL
      AND f.lat IS NOT NULL
      AND f.lng IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.farm_rainfall_slots s WHERE s.field_id = f.id
      )
    ORDER BY f.created_at NULLS LAST, f.id
    OFFSET open.ord - 1
    LIMIT 1
  ) pick ON true
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public._fill_open_rainfall_slots(uuid) FROM PUBLIC, anon, authenticated;

-- Deferred so a restore that inserts many fields in one transaction sees every
-- row before any slot is taken. Immediate assignment would lock the first two
-- inserts, not the two oldest created_at values.
CREATE OR REPLACE FUNCTION public.assign_farm_rainfall_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.lat IS NOT DISTINCT FROM NEW.lat
     AND OLD.lng IS NOT DISTINCT FROM NEW.lng
     AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rainfall_slots:' || NEW.farm_id::text));

  -- Soft-delete releases the slot. Clearing coordinates does not: the field
  -- keeps the slot and simply has no rainfall until lat/lng return. Restoring
  -- a former slot field does not evict whoever refilled the slot.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    DELETE FROM public.farm_rainfall_slots s WHERE s.field_id = NEW.id;
  END IF;

  PERFORM public._fill_open_rainfall_slots(NEW.farm_id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_farm_rainfall_slots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_farm_rainfall_slots ON public.fields;
CREATE CONSTRAINT TRIGGER assign_farm_rainfall_slots
  AFTER INSERT OR UPDATE OF lat, lng, deleted_at ON public.fields
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_farm_rainfall_slots();

-- Existing farms: the same ordering the old read path used. Idempotent.
INSERT INTO public.farm_rainfall_slots (farm_id, slot, field_id)
SELECT ranked.farm_id, ranked.rn::smallint, ranked.id
FROM (
  SELECT f.farm_id, f.id,
         row_number() OVER (
           PARTITION BY f.farm_id
           ORDER BY f.created_at NULLS LAST, f.id
         ) AS rn
  FROM public.fields f
  WHERE f.deleted_at IS NULL
    AND f.lat IS NOT NULL
    AND f.lng IS NOT NULL
) ranked
WHERE ranked.rn <= 2
ON CONFLICT DO NOTHING;

-- Stored slots that are still active and have coordinates. Paid plans are not
-- expanded here; farm_rainfall_field_ids still returns every eligible field
-- when the plan's rainfall_slot_cap is NULL. Free reads and daily collection
-- use the stored rows.
CREATE OR REPLACE FUNCTION public.rainfall_slot_field_ids(p_farm_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.field_id
  FROM public.farm_rainfall_slots s
  JOIN public.fields f ON f.id = s.field_id AND f.farm_id = s.farm_id
  WHERE s.farm_id = p_farm_id
    AND f.deleted_at IS NULL
    AND f.lat IS NOT NULL
    AND f.lng IS NOT NULL
  ORDER BY s.slot
$$;

REVOKE ALL ON FUNCTION public.rainfall_slot_field_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rainfall_slot_field_ids(uuid) TO service_role;

-- Same contract as 20261107040000: slot fields on a capped (free) plan, every
-- eligible field when rainfall_slot_cap is NULL (paid / complimentary).
CREATE OR REPLACE FUNCTION public.farm_rainfall_field_ids(p_farm_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id
  FROM public.fields f
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.farm_id = p_farm_id)
    AND f.farm_id = p_farm_id
    AND f.deleted_at IS NULL
    AND f.lat IS NOT NULL
    AND f.lng IS NOT NULL
    AND (
      (SELECT e.rainfall_slot_cap FROM public._farm_entitlement(p_farm_id) e) IS NULL
      OR EXISTS (
        SELECT 1 FROM public.farm_rainfall_slots s
        WHERE s.field_id = f.id AND s.farm_id = f.farm_id
      )
    )
  ORDER BY f.created_at NULLS LAST, f.id
$$;

REVOKE ALL ON FUNCTION public.farm_rainfall_field_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.farm_rainfall_field_ids(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rainfall_collectable_fields(
  p_tier text, p_after uuid DEFAULT NULL, p_limit int DEFAULT 1000
)
RETURNS TABLE (id uuid, lat numeric, lng numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enforce boolean := public.entitlements_mode() = 'enforce';
  v_limit int := least(greatest(coalesce(p_limit, 1000), 1), 10000);
BEGIN
  IF p_tier = 'hourly' THEN
    RETURN QUERY
    SELECT f.id, f.lat, f.lng FROM public.fields f
    WHERE f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL
      AND (p_after IS NULL OR f.id > p_after)
      AND (NOT v_enforce OR (SELECT e.plan FROM public._farm_entitlement(f.farm_id) e) <> 'free')
    ORDER BY f.id
    LIMIT v_limit;
  ELSIF p_tier IN ('daily', 'daily_any') THEN
    -- 'daily' collects nothing while mode = 'off' so that mode behaves exactly as before.
    -- 'daily_any' ignores the mode (used by the seed function so it can run before shadow).
    IF p_tier = 'daily' AND NOT (public.entitlements_mode() <> 'off') THEN
      RETURN;
    END IF;
    RETURN QUERY
    SELECT f.id, f.lat, f.lng
    FROM public.farm_rainfall_slots s
    JOIN public.fields f ON f.id = s.field_id AND f.farm_id = s.farm_id
    WHERE f.deleted_at IS NULL
      AND f.lat IS NOT NULL
      AND f.lng IS NOT NULL
      AND (p_after IS NULL OR f.id > p_after)
      AND (SELECT e.plan FROM public._farm_entitlement(f.farm_id) e) = 'free'
    ORDER BY f.id
    LIMIT v_limit;
  ELSE
    RAISE EXCEPTION 'unknown rainfall tier: %', p_tier USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rainfall_collectable_fields(text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rainfall_collectable_fields(text, uuid, int) TO service_role;

-- Same wrapper as 20261107050000, plus the transaction-local restore flag so
-- field INSERTs keep the backup's created_at. The flag is set before the impl
-- runs; triggers in that call see it. PostgREST clients cannot set the GUC.
CREATE OR REPLACE FUNCTION public.restore_farm_backup(
  p_payload jsonb,
  p_active_season integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '120s'
AS $$
DECLARE
  v_farm_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  SELECT farm_id INTO v_farm_id FROM public.profiles WHERE id = auth.uid();
  IF v_farm_id IS NOT NULL THEN
    PERFORM public.assert_premium(v_farm_id, 'backup_restore');
  END IF;
  PERFORM set_config('acreledger.restoring', 'on', true);
  RETURN public._restore_farm_backup_impl(p_payload, p_active_season);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;
