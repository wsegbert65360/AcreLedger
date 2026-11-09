-- Free tier review item 6: an explicit single-field mrms-backfill used to write hourly rows for ANY field.
-- This lets the edge function ask the same question the bulk path already answers: may this field have
-- hourly rainfall collected right now? Same rule as rainfall_collectable_fields('hourly'): active field with
-- coordinates, and (mode is not 'enforce' or the farm is not on the free plan). Service role only.
CREATE OR REPLACE FUNCTION public.rainfall_field_hourly_allowed(p_field_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fields f
    WHERE f.id = p_field_id
      AND f.deleted_at IS NULL AND f.lat IS NOT NULL AND f.lng IS NOT NULL
      AND (public.entitlements_mode() <> 'enforce'
           OR (SELECT e.plan FROM public._farm_entitlement(f.farm_id) e) <> 'free')
  )
$$;
REVOKE ALL ON FUNCTION public.rainfall_field_hourly_allowed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rainfall_field_hourly_allowed(uuid) TO service_role;
