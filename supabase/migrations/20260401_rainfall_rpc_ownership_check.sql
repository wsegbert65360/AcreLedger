-- ============================================================
-- ACRELEDGER MIGRATION: 20260401_rainfall_rpc_ownership_check.sql
-- Purpose: Add farm ownership check to get_rainfall_stats RPC
--          so users can only query fields belonging to their farm.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_rainfall_stats(
  p_field_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  total_inches numeric,
  hours_with_rain integer,
  max_hourly_in numeric,
  coverage_percent numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(r.rainfall_in), 0)::numeric AS total_inches,
    COUNT(CASE WHEN r.rainfall_in > 0 THEN 1 END)::integer AS hours_with_rain,
    COALESCE(MAX(r.rainfall_in), 0)::numeric AS max_hourly_in,
    ROUND(
      CASE 
        WHEN (EXTRACT(EPOCH FROM (p_end_date::timestamp - p_start_date::timestamp)) / 3600) > 0 
        THEN (COUNT(r.id)::numeric / (EXTRACT(EPOCH FROM (p_end_date::timestamp - p_start_date::timestamp)) / 3600 + 1)) * 100
        ELSE 0 
      END, 2
    ) AS coverage_percent
  FROM public.field_rainfall_hourly r
  WHERE r.field_id = p_field_id
    AND r.timestamp_utc::date BETWEEN p_start_date AND p_end_date
    AND (r.finalized = true OR r.source = 'Pass 2')
    -- Ownership check: user can only query fields in their farm
    AND r.field_id IN (
      SELECT f.id FROM public.fields f
      WHERE f.farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION public.get_rainfall_stats(uuid, date, date) TO authenticated;

COMMIT;
