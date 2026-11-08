-- Free tier, Phase 3: photo cap (per farm), server-checked. Grandfathers existing data.
-- Photos currently live as base64 "[ATTACHMENT:data:image/...]" tokens inside spray_records.notes
-- (moving them to file storage is a separate change). Only ADDING a photo to a record is refused
-- at the cap; records that already carry a photo can always be re-saved. No-op while mode = 'off'.

CREATE OR REPLACE FUNCTION public.guard_photo_cap()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := public.entitlements_mode();
  v_plan text;
  v_cap int;
  v_count int;
BEGIN
  IF v_mode = 'off' OR NEW.farm_id IS NULL THEN RETURN NEW; END IF;
  -- Re-saving a record that already holds a photo is never a new photo (upserts, edits).
  IF EXISTS (
    SELECT 1 FROM public.spray_records s
    WHERE s.id = NEW.id AND s.notes LIKE '%[ATTACHMENT:data:image/%'
  ) THEN RETURN NEW; END IF;
  SELECT e.plan, e.photo_cap INTO v_plan, v_cap FROM public._farm_entitlement(NEW.farm_id) e;
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('photo_cap:' || NEW.farm_id::text));
  SELECT count(*)::int INTO v_count FROM public.spray_records s
  WHERE s.farm_id = NEW.farm_id AND s.deleted_at IS NULL AND s.id <> NEW.id
    AND s.notes LIKE '%[ATTACHMENT:data:image/%';
  IF v_count < v_cap THEN RETURN NEW; END IF;
  IF v_mode = 'shadow' THEN
    INSERT INTO public.entitlement_shadow_log (farm_id, feature, plan, user_id)
    VALUES (NEW.farm_id, 'photo_cap', v_plan, auth.uid());
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'premium_required:photo_cap' USING ERRCODE = 'P0402';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_photo_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_photo_cap_insert ON public.spray_records;
CREATE TRIGGER guard_photo_cap_insert BEFORE INSERT ON public.spray_records
  FOR EACH ROW WHEN (NEW.deleted_at IS NULL AND NEW.notes LIKE '%[ATTACHMENT:data:image/%')
  EXECUTE FUNCTION public.guard_photo_cap();

-- Attaching a photo to an existing record that had none.
DROP TRIGGER IF EXISTS guard_photo_cap_update ON public.spray_records;
CREATE TRIGGER guard_photo_cap_update BEFORE UPDATE OF notes ON public.spray_records
  FOR EACH ROW WHEN (
    NEW.deleted_at IS NULL
    AND NEW.notes LIKE '%[ATTACHMENT:data:image/%'
    AND (OLD.notes IS NULL OR OLD.notes NOT LIKE '%[ATTACHMENT:data:image/%')
  )
  EXECUTE FUNCTION public.guard_photo_cap();
