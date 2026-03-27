-- =============================================
-- ACRELEDGER MIGRATION: 20260327_reschedule_rainfall_rollup.sql
-- Purpose: 
-- 1. Harden rollup logic to include 'Pass 2' source records.
-- 2. Reschedule cron job from 6 AM to 8 AM for better data accuracy.
-- =============================================

BEGIN;

-- 1. Update rollup_farm_rainfall function with logic hardening
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
    -- Calculate stats from field_rainfall_hourly data
    -- HARDENING: Include finalized=true OR source='Pass 2'
    WITH field_stats AS (
        SELECT 
            r.field_id,
            COALESCE(SUM(r.rainfall_in), 0) as total_in,
            COALESCE(MAX(r.rainfall_in), 0) as max_hr_in
        FROM public.field_rainfall_hourly r
        JOIN public.fields f ON f.id = r.field_id
        WHERE f.farm_id = p_farm_id 
          AND r.timestamp_utc::date = p_date
          AND (r.finalized = true OR r.source = 'Pass 2')
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

-- 2. Reschedule the daily cron job
-- Unschedule the old 6 AM job if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'farm-daily-rainfall-rollup') THEN
        PERFORM cron.unschedule('farm-daily-rainfall-rollup');
    END IF;
END $$;

-- Schedule the new 8 AM job
SELECT cron.schedule(
    'farm-daily-rainfall-rollup',
    '0 8 * * *',
    $$ SELECT public.rollup_all_farms_daily(CURRENT_DATE - 1); $$
);

COMMIT;