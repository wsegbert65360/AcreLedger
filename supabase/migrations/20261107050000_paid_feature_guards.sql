-- Free tier, Phase 5: server-side guards for paid-only write paths.
-- Nothing changes while entitlements mode = 'off'; 'shadow' only logs; 'enforce' raises
-- P0402 premium_required:<feature>. SELECT is never touched, so existing data stays visible.
--
-- Rules (all tables):
--   * Service-role / internal callers (auth.uid() IS NULL) are never blocked.
--   * Soft-deleting a row (deleted_at set) is always allowed: nothing is held hostage.
--   * Existing values are grandfathered: an UPDATE is only checked when it changes a gated value.

-- Whole-table guards: bins, grain movements, equipment, maintenance, CLU/tract data.
CREATE OR REPLACE FUNCTION public.guard_premium_table()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM public.assert_premium(NEW.farm_id, TG_ARGV[0]);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_premium_table() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_premium_bins ON public.bins;
CREATE TRIGGER guard_premium_bins BEFORE INSERT OR UPDATE ON public.bins
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('grain');
DROP TRIGGER IF EXISTS guard_premium_grain_movements ON public.grain_movements;
CREATE TRIGGER guard_premium_grain_movements BEFORE INSERT OR UPDATE ON public.grain_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('grain');
DROP TRIGGER IF EXISTS guard_premium_equipment ON public.equipment;
CREATE TRIGGER guard_premium_equipment BEFORE INSERT OR UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('equipment');
DROP TRIGGER IF EXISTS guard_premium_maintenance_logs ON public.maintenance_logs;
CREATE TRIGGER guard_premium_maintenance_logs BEFORE INSERT OR UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('equipment');
DROP TRIGGER IF EXISTS guard_premium_maintenance_schedules ON public.maintenance_schedules;
CREATE TRIGGER guard_premium_maintenance_schedules BEFORE INSERT OR UPDATE ON public.maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('equipment');
DROP TRIGGER IF EXISTS guard_premium_field_clu_assignments ON public.field_clu_assignments;
CREATE TRIGGER guard_premium_field_clu_assignments BEFORE INSERT OR UPDATE ON public.field_clu_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('fsa_tract');
DROP TRIGGER IF EXISTS guard_premium_fsa_tract_imports ON public.fsa_tract_imports;
CREATE TRIGGER guard_premium_fsa_tract_imports BEFORE INSERT OR UPDATE ON public.fsa_tract_imports
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_table('fsa_tract');

-- Harvests stay free; sending a harvest into a bin (the grain link) is paid.
CREATE OR REPLACE FUNCTION public.guard_harvest_bin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := to_jsonb(NEW);
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF (v_new->>'destination' = 'bin' OR v_new->>'bin_id' IS NOT NULL)
     AND (v_new->>'destination' IS DISTINCT FROM v_old->>'destination'
          OR v_new->>'bin_id' IS DISTINCT FROM v_old->>'bin_id') THEN
    PERFORM public.assert_premium(NEW.farm_id, 'grain');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_harvest_bin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_premium_harvest_bin ON public.harvest_records;
CREATE TRIGGER guard_premium_harvest_bin BEFORE INSERT OR UPDATE ON public.harvest_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_harvest_bin();

-- Field columns: FSA farm/tract/field numbers + CLU numbers (feature 'fsa_tract') and
-- landlord name / a real crop share (producer share below 100) (feature 'landlord_split').
-- The app writes producer_share = 100 on every new field, which is "no split" and stays free.
CREATE OR REPLACE FUNCTION public.guard_field_premium_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := to_jsonb(NEW);
  c text;
  v_old_val text;
  v_new_val text;
BEGIN
  IF auth.uid() IS NULL OR public.entitlements_mode() = 'off' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  FOREACH c IN ARRAY ARRAY['fsa_farm_number', 'fsa_tract_number', 'fsa_field_number', 'clu_numbers'] LOOP
    v_new_val := nullif(nullif(btrim(v_new->>c), ''), '[]');
    v_old_val := nullif(nullif(btrim(v_old->>c), ''), '[]');
    IF v_new_val IS NOT NULL AND v_new_val IS DISTINCT FROM v_old_val THEN
      PERFORM public.assert_premium(NEW.farm_id, 'fsa_tract');
      EXIT;
    END IF;
  END LOOP;

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
DROP TRIGGER IF EXISTS guard_premium_field_columns ON public.fields;
CREATE TRIGGER guard_premium_field_columns BEFORE INSERT OR UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.guard_field_premium_columns();

-- Backup restore is paid. The existing function keeps its body unchanged under a private name;
-- the public name becomes a thin wrapper that checks the plan first.
DO $$
BEGIN
  IF to_regprocedure('public._restore_farm_backup_impl(jsonb,integer)') IS NULL THEN
    ALTER FUNCTION public.restore_farm_backup(jsonb, integer) RENAME TO _restore_farm_backup_impl;
    REVOKE ALL ON FUNCTION public._restore_farm_backup_impl(jsonb, integer) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

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
  RETURN public._restore_farm_backup_impl(p_payload, p_active_season);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_farm_backup(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_farm_backup(jsonb, integer) TO authenticated;
