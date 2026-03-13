-- DEFINITIVE SYNC FIX
-- Corrects rollup column name mismatch, drops all stats variants, and ensures JSONB return.

BEGIN;

-- 1. Fix Rollup Function (Correct column name is last_updated_at)
CREATE OR REPLACE FUNCTION rollup_field_rainfall(p_field_id UUID, p_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO field_rainfall_daily (field_id, date_local, rainfall_in)
    SELECT 
        field_id, 
        p_date,
        SUM(rainfall_in)
    FROM field_rainfall_hourly
    WHERE field_id = p_field_id 
      AND (timestamp_utc AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::DATE = p_date
    ON CONFLICT (field_id, date_local) 
    DO UPDATE SET 
        rainfall_in = EXCLUDED.rainfall_in,
        last_updated_at = NOW(); -- FIXED: was updated_at
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Aggressively drop all previous variants of get_field_rainfall_stats
DROP FUNCTION IF EXISTS get_field_rainfall_stats(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(UUID);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(p_field_id UUID);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(p_field_id UUID, p_days INTEGER);

-- 3. Create the definitive JSONB version
CREATE OR REPLACE FUNCTION get_field_rainfall_stats(p_field_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_planting_date TIMESTAMPTZ;
    v_last_spray_date TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    -- Get Activity Dates (already TIMESTAMPTZ in our schema)
    SELECT MAX(timestamp) INTO v_planting_date 
    FROM plant_records WHERE field_id = p_field_id AND deleted_at IS NULL;
    
    SELECT MAX(timestamp) INTO v_last_spray_date 
    FROM spray_records WHERE field_id = p_field_id AND deleted_at IS NULL;

    SELECT jsonb_build_object(
        'today_in', COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_hourly WHERE field_id = p_field_id AND timestamp_utc >= CURRENT_DATE AT TIME ZONE 'UTC'), 0),
        'yesterday_in', COALESCE((SELECT rainfall_in FROM field_rainfall_daily WHERE field_id = p_field_id AND date_local = (CURRENT_DATE - 1)), 0),
        'last_7_days_in', COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_daily WHERE field_id = p_field_id AND date_local >= (CURRENT_DATE - 7)), 0),
        'since_planting_in', COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_hourly WHERE field_id = p_field_id AND v_planting_date IS NOT NULL AND timestamp_utc >= v_planting_date), 0),
        'since_last_spray_in', COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_hourly WHERE field_id = p_field_id AND v_last_spray_date IS NOT NULL AND timestamp_utc >= v_last_spray_date), 0),
        'last_updated', (SELECT MAX(timestamp_utc) FROM field_rainfall_hourly WHERE field_id = p_field_id),
        'source', 'NOAA MRMS',
        'historical_backfill_status', COALESCE((SELECT status FROM field_rainfall_coverage WHERE field_id = p_field_id ORDER BY last_checked_at DESC LIMIT 1), 'not_started')
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
