-- =============================================
-- ACRELEDGER MIGRATION: 20250313_rainfall_weather_fixes.sql
-- Purpose: Fix performance + stats for broken weather/rainfall feature
-- Runs AFTER all your 20240313_* files
-- Adds: indexes, RPC stats function, coverage view, auto-update trigger
-- =============================================

-- 1. Performance indexes (critical now that MRMS backfill will run again)
CREATE INDEX IF NOT EXISTS idx_field_rainfall_hourly_field_time 
  ON public.field_rainfall_hourly (field_id, timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_field_rainfall_hourly_source_finalized 
  ON public.field_rainfall_hourly (source, finalized);

CREATE INDEX IF NOT EXISTS idx_field_rainfall_coverage_status 
  ON public.field_rainfall_coverage (status, range_start_utc);

-- 2. Rainfall statistics RPC (replaces/fixes the old rainfall_stats_rpc)
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
      (COUNT(r.id)::numeric / 
       EXTRACT(EPOCH FROM (p_end_date::timestamp - p_start_date::timestamp)) / 3600
      ) * 100, 2
    ) AS coverage_percent
  FROM public.field_rainfall_hourly r
  WHERE r.field_id = p_field_id
    AND r.timestamp_utc::date BETWEEN p_start_date AND p_end_date
    AND r.finalized = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Grant execute to authenticated users (for your frontend)
GRANT EXECUTE ON FUNCTION public.get_rainfall_stats(uuid, date, date) TO authenticated;

-- 3. View for quick coverage gaps (used in dashboard & backfill)
CREATE OR REPLACE VIEW public.rainfall_coverage_gaps AS
SELECT 
  f.id AS field_id,
  f.name AS field_name,
  c.range_start_utc,
  c.range_end_utc,
  c.status,
  c.last_checked_at,
  EXTRACT(EPOCH FROM (c.range_end_utc - c.range_start_utc)) / 3600 AS hours_covered
FROM public.fields f
LEFT JOIN public.field_rainfall_coverage c 
  ON f.id = c.field_id
WHERE c.status IN ('pending', 'partial')
ORDER BY c.range_start_utc DESC;

-- 4. Trigger to auto-update coverage status when new hourly data arrives
CREATE OR REPLACE FUNCTION public.update_rainfall_coverage_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.field_rainfall_coverage
  SET 
    status = CASE 
      WHEN NEW.finalized AND NEW.rainfall_in > 0 THEN 'complete'
      WHEN NEW.finalized THEN 'partial'
      ELSE 'pending'
    END,
    last_checked_at = now()
  WHERE field_id = NEW.field_id
    AND range_start_utc <= NEW.timestamp_utc
    AND range_end_utc > NEW.timestamp_utc;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_update_rainfall_coverage ON public.field_rainfall_hourly;
CREATE TRIGGER trg_update_rainfall_coverage
  AFTER INSERT OR UPDATE ON public.field_rainfall_hourly
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rainfall_coverage_status();

-- 5. Final RLS + comment
ALTER TABLE public.field_rainfall_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_rainfall_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see only their farm rainfall" ON public.field_rainfall_hourly
  FOR ALL USING (
    field_id IN (
      SELECT id FROM public.fields 
      WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users see only their farm rainfall coverage" ON public.field_rainfall_coverage
  FOR ALL USING (
    field_id IN (
      SELECT id FROM public.fields 
      WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
  );

COMMENT ON TABLE public.field_rainfall_hourly IS 'MRMS hourly rainfall (inches) - fixed March 2026';
COMMENT ON FUNCTION public.get_rainfall_stats IS 'Main rainfall stats function used by dashboard (replaces old RPC)';

-- =============================================
-- DONE! Run this in Supabase SQL editor or as next migration.
-- =============================================