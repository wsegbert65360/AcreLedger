-- Migration: Supabase Edge Function Backend for Rainfall

-- 1. Ensure extensions & settings table
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS rainfall_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 2. Rainfall Tables
CREATE TABLE IF NOT EXISTS field_rainfall_hourly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    timestamp_utc TIMESTAMPTZ NOT NULL,
    rainfall_mm DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
    source VARCHAR(50) NOT NULL DEFAULT 'MRMS',
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(field_id, timestamp_utc)
);

CREATE INDEX IF NOT EXISTS idx_field_rainfall_timestamp ON field_rainfall_hourly(field_id, timestamp_utc);

CREATE TABLE IF NOT EXISTS field_rainfall_daily (
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    date_local DATE NOT NULL,
    rainfall_mm DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
    source VARCHAR(50) NOT NULL DEFAULT 'MRMS',
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (field_id, date_local)
);

CREATE TABLE IF NOT EXISTS field_rainfall_coverage (
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    range_start_utc TIMESTAMPTZ NOT NULL,
    range_end_utc TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (field_id, range_start_utc)
);

-- 3. Ingestion Function (Simplified RPC for rollup)
CREATE OR REPLACE FUNCTION rollup_field_rainfall(p_field_id UUID, p_date DATE)
RETURNS VOID AS $$
BEGIN
    INSERT INTO field_rainfall_daily (field_id, date_local, rainfall_mm, source, finalized)
    SELECT 
        field_id, 
        timestamp_utc::date, 
        SUM(rainfall_mm),
        'MRMS',
        BOOL_AND(finalized)
    FROM field_rainfall_hourly
    WHERE field_id = p_field_id AND timestamp_utc::date = p_date
    GROUP BY field_id, timestamp_utc::date
    ON CONFLICT (field_id, date_local) 
    DO UPDATE SET 
        rainfall_mm = EXCLUDED.rainfall_mm,
        finalized = EXCLUDED.finalized,
        last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS for Rainfall Tables
ALTER TABLE field_rainfall_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_rainfall_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_rainfall_coverage ENABLE ROW LEVEL SECURITY;

-- Assuming field ownership via tenant_id or user_id in the fields table
-- You may need to adjust these based on your exact isolation model

-- 5. Cron Jobs
-- NOTE (2026-04-02): The original cron.schedule calls contained a hardcoded
-- project URL. This has been sanitized. In production, the edge function
-- URL should be referenced via an environment variable or the Supabase
-- project settings, not hardcoded in SQL.
-- The cron jobs should be configured through the Supabase Dashboard
-- (Database > Webhooks) or via the Supabase CLI.

-- Hourly ingestion at minute 20 (standard NOAA latency offset)
-- Original URL sanitized — configure via Supabase Dashboard
SELECT cron.schedule(
    'mrms-hourly-ingestion',
    '20 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/mrms-hourly',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT value FROM rainfall_settings WHERE key = 'service_role_key' LIMIT 1)
        )
    );
    $$
);

-- Morning backfill at 7 AM
SELECT cron.schedule(
    'mrms-morning-backfill',
    '5 7 * * *',
    $$
    SELECT net.http_post(
        url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/mrms-backfill',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT value FROM rainfall_settings WHERE key = 'service_role_key' LIMIT 1)
        ),
        body := '{"mode": "overnight"}'::jsonb
    );
    $$
);

-- 6. Helper for Frontend to get Rainfall Stats
CREATE OR REPLACE FUNCTION get_field_rainfall_stats(p_field_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_planting_date TIMESTAMPTZ;
    v_last_spray_date TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    -- Get Activity Dates
    SELECT to_timestamp(MAX(timestamp) / 1000.0) INTO v_planting_date 
    FROM plant_records WHERE field_id = p_field_id AND deleted_at IS NULL;
    
    SELECT to_timestamp(MAX(timestamp) / 1000.0) INTO v_last_spray_date 
    FROM spray_records WHERE field_id = p_field_id AND deleted_at IS NULL;

    SELECT jsonb_build_object(
        'today_mm', COALESCE((SELECT SUM(rainfall_mm) FROM field_rainfall_hourly WHERE field_id = p_field_id AND timestamp_utc >= CURRENT_DATE AT TIME ZONE 'UTC'), 0),
        'yesterday_mm', COALESCE((SELECT rainfall_mm FROM field_rainfall_daily WHERE field_id = p_field_id AND date_local = (CURRENT_DATE - 1)), 0),
        'last_7_days_mm', COALESCE((SELECT SUM(rainfall_mm) FROM field_rainfall_daily WHERE field_id = p_field_id AND date_local >= (CURRENT_DATE - 7)), 0),
        'since_planting_mm', COALESCE((SELECT SUM(rainfall_mm) FROM field_rainfall_hourly WHERE field_id = p_field_id AND v_planting_date IS NOT NULL AND timestamp_utc >= v_planting_date), 0),
        'since_last_spray_mm', COALESCE((SELECT SUM(rainfall_mm) FROM field_rainfall_hourly WHERE field_id = p_field_id AND v_last_spray_date IS NOT NULL AND timestamp_utc >= v_last_spray_date), 0),
        'last_updated', (SELECT MAX(timestamp_utc) FROM field_rainfall_hourly WHERE field_id = p_field_id),
        'source', 'NOAA MRMS',
        'historical_backfill_status', COALESCE((SELECT status FROM field_rainfall_coverage WHERE field_id = p_field_id ORDER BY last_checked_at DESC LIMIT 1), 'pending')
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
