-- =============================================
-- ACRELEDGER REPAIR MIGRATION: 20260321_repair_rainfall_infrastructure.sql
-- Purpose: Restore missing rainfall infrastructure (tables, indexes, RPC)
-- =============================================

BEGIN;

-- 1. Create hourly rainfall tracking table
CREATE TABLE IF NOT EXISTS public.field_rainfall_hourly (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    timestamp_utc timestamptz NOT NULL,
    rainfall_in numeric DEFAULT 0,
    source text DEFAULT 'MRMS',
    finalized boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    UNIQUE(field_id, timestamp_utc)
);

-- 2. Create coverage tracking table
CREATE TABLE IF NOT EXISTS public.field_rainfall_coverage (
    field_id uuid NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    range_start_utc timestamptz NOT NULL,
    range_end_utc timestamptz NOT NULL,
    status text DEFAULT 'pending', -- pending | partial | complete
    last_checked_at timestamptz DEFAULT now(),
    PRIMARY KEY (field_id, range_start_utc)
);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_field_rainfall_hourly_field_time 
  ON public.field_rainfall_hourly (field_id, timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_field_rainfall_hourly_source_finalized 
  ON public.field_rainfall_hourly (source, finalized);

CREATE INDEX IF NOT EXISTS idx_field_rainfall_coverage_status 
  ON public.field_rainfall_coverage (status, range_start_utc);

-- 4. Rainfall statistics RPC (replaces/fixes the old rainfall_stats_rpc)
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
    AND r.finalized = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_rainfall_stats(uuid, date, date) TO authenticated;

-- 5. Enable RLS
ALTER TABLE public.field_rainfall_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_rainfall_coverage ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Users see only their farm rainfall" ON public.field_rainfall_hourly;
CREATE POLICY "Users see only their farm rainfall" ON public.field_rainfall_hourly
  FOR ALL USING (
    field_id IN (
      SELECT id FROM public.fields 
      WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users see only their farm rainfall coverage" ON public.field_rainfall_coverage;
CREATE POLICY "Users see only their farm rainfall coverage" ON public.field_rainfall_coverage
  FOR ALL USING (
    field_id IN (
      SELECT id FROM public.fields 
      WHERE farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
  );

COMMIT;
