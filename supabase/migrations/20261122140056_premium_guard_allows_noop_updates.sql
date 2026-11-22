-- Replays are never refused: let a no-op UPDATE through the Pro table guard.
--
-- update_equipment_reading always UPDATEs the equipment row, even when the
-- reading is not higher (greatest(current_reading, p_reading) keeps it). After
-- a farm drops to the free plan, guard_premium_table('equipment') refused even
-- that no-op with P0402, so a queued reading replayed from the offline queue
-- parked instead of settling. The meter RPCs must not be replaced, so the fix
-- is here: an UPDATE that changes nothing but updated_at is allowed. Any real
-- change to a Pro table still needs Pro; soft deletes stay allowed.

CREATE OR REPLACE FUNCTION public.guard_premium_table()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_premium(NEW.farm_id, TG_ARGV[0]);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_premium_table() FROM PUBLIC, anon, authenticated;
