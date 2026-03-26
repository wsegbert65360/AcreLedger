-- =============================================
-- ACRELEDGER MIGRATION: 20260325_farm_rainfall_summaries.sql
-- Purpose: Precompute farm-level rainfall summaries daily at 6 AM
-- Includes: farm_rainfall_daily table, rollup functions, pg_cron schedule
-- =============================================

BEGIN;

-- 1. Create farm-level rainfall summary table
CREATE TABLE IF NOT EXISTS public.farm_rainfall_daily (
    farm_id uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
    date_local date NOT NULL,
    avg_rainfall_in numeric DEFAULT 0,
    max_rainfall_in numeric DEFAULT 0,
    min_rainfall_in numeric DEFAULT 0,
    max_hourly_in numeric DEFAULT 0,
    fields_count integer DEFAULT 0,
    last_updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (farm_id, date_local)
);

-- Index for performance querying by date/farm
CREATE INDEX IF NOT EXISTS idx_farm_rainfall_daily_date ON public.farm_rainfall_daily (date_local DESC);

-- 2. Function to rollup a single farm for a specific date
CREATE OR REPLACE FUNCTION public.rollup_farm_rainfall(
    p_farm_id uuid,
    p_date date
)
RETURNS void AS $$
DECLARE
    v_avg_in numeric;
    v_max_in numeric;
    v_min_in numeric;
    v_max_hr_in numeric;
    v_count integer;
BEGIN
    -- Calculate stats from finalized field_rainfall_hourly data
    WITH field_stats AS (
        SELECT 
            r.field_id,
            COALESCE(SUM(r.rainfall_in), 0) as total_in,
            COALESCE(MAX(r.rainfall_in), 0) as max_hr_in
        FROM public.field_rainfall_hourly r
        JOIN public.fields f ON f.id = r.field_id
        WHERE f.farm_id = p_farm_id 
          AND r.timestamp_utc::date = p_date
          AND r.finalized = true
        GROUP BY r.field_id
    )
    SELECT 
        COALESCE(AVG(total_in), 0),
        COALESCE(MAX(total_in), 0),
        COALESCE(MIN(total_in), 0),
        COALESCE(MAX(max_hr_in), 0),
        COUNT(*)
    INTO v_avg_in, v_max_in, v_min_in, v_max_hr_in, v_count
    FROM field_stats;

    -- Upsert into summary table
    IF v_count > 0 THEN
        INSERT INTO public.farm_rainfall_daily (
            farm_id, date_local, avg_rainfall_in, max_rainfall_in, min_rainfall_in, max_hourly_in, fields_count, last_updated_at
        )
        VALUES (
            p_farm_id, p_date, v_avg_in, v_max_in, v_min_in, v_max_hr_in, v_count, now()
        )
        ON CONFLICT (farm_id, date_local) DO UPDATE SET
            avg_rainfall_in = EXCLUDED.avg_rainfall_in,
            max_rainfall_in = EXCLUDED.max_rainfall_in,
            min_rainfall_in = EXCLUDED.min_rainfall_in,
            max_hourly_in = EXCLUDED.max_hourly_in,
            fields_count = EXCLUDED.fields_count,
            last_updated_at = now();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 3. Function to rollup all farms for a specific date
CREATE OR REPLACE FUNCTION public.rollup_all_farms_daily(
    p_date date
)
RETURNS void AS $$
DECLARE
    f_id uuid;
BEGIN
    FOR f_id IN SELECT id FROM public.farms LOOP
        PERFORM public.rollup_farm_rainfall(f_id, p_date);
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 4. Schedule the daily cron job at 6 AM
-- Note: '0 6 * * *' means 6:00 AM every day
-- We rollup for CURRENT_DATE - 1 (yesterday)
SELECT cron.schedule(
    'farm-daily-rainfall-rollup',
    '0 6 * * *',
    $$ SELECT public.rollup_all_farms_daily(CURRENT_DATE - 1); $$
);

-- Grant permissions to authenticated users for viewing
GRANT SELECT ON public.farm_rainfall_daily TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_all_farms_daily(date) TO authenticated;

COMMIT;
