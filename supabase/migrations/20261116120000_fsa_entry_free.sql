-- FSA/CLU data entry is free (decision 2026-11-16). Prepared reports stay Pro.
--
-- Removes only the 'fsa_tract' write guards added in 20261107050000_paid_feature_guards.sql:
--   * guard_premium_fsa_tract_imports      (whole-table guard on fsa_tract_imports)
--   * guard_premium_field_clu_assignments  (whole-table guard on field_clu_assignments)
--   * the FSA farm/tract/field number + clu_numbers check inside guard_field_premium_columns
--
-- Unchanged: RLS and farm scoping on both tables, soft-delete policies, and every other guard
-- (reports, grain, harvest bin link, equipment, landlord_split, rainfall, backup restore,
-- field cap, cattle events). 'fsa_tract' stays in assert_premium's feature allowlist so an
-- older client that still asks about it gets an answer instead of an unknown-feature error.

DROP TRIGGER IF EXISTS guard_premium_fsa_tract_imports ON public.fsa_tract_imports;
DROP TRIGGER IF EXISTS guard_premium_field_clu_assignments ON public.field_clu_assignments;

-- Same body as 20261110180000_pre_season_reset_undo.sql minus the FSA column loop.
-- Landlord name and a real crop share (producer share below 100) remain Pro.
CREATE OR REPLACE FUNCTION public.guard_field_premium_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.fields%ROWTYPE;
  v_old jsonb;
  v_new jsonb := pg_catalog.to_jsonb(NEW);
  v_old_val text;
  v_new_val text;
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := pg_catalog.to_jsonb(OLD);
  ELSIF pg_catalog.current_setting('acreledger.restoring', true) = 'on' THEN
    SELECT f.* INTO v_existing FROM public.fields f WHERE f.id = NEW.id;
    v_old := CASE WHEN FOUND THEN pg_catalog.to_jsonb(v_existing) ELSE '{}'::jsonb END;
  ELSE
    v_old := '{}'::jsonb;
  END IF;

  v_new_val := nullif(btrim(v_new->>'landlord_name'), '');
  v_old_val := nullif(btrim(v_old->>'landlord_name'), '');
  IF v_new_val IS NOT NULL AND v_new_val IS DISTINCT FROM v_old_val THEN
    PERFORM public.assert_premium(NEW.farm_id, 'landlord_split');
  END IF;

  IF NEW.producer_share IS NOT NULL AND NEW.producer_share < 100
     AND NEW.producer_share IS DISTINCT FROM (v_old->>'producer_share')::numeric THEN
    PERFORM public.assert_premium(NEW.farm_id, 'landlord_split');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_field_premium_columns() FROM PUBLIC, anon, authenticated;
