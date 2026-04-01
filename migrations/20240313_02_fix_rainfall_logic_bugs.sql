BEGIN;

-- 1. Fix Rollup Function to use a parameterized timezone (default America/Chicago for backward compatibility)
CREATE OR REPLACE FUNCTION rollup_field_rainfall(p_field_id UUID, p_date DATE, p_timezone TEXT DEFAULT 'America/Chicago')
RETURNS void AS $$
BEGIN
    INSERT INTO field_rainfall_daily (field_id, date_local, rainfall_in)
    SELECT 
        field_id, 
        p_date,
        SUM(rainfall_in)
    FROM field_rainfall_hourly
    WHERE field_id = p_field_id 
      AND (timestamp_utc AT TIME ZONE 'UTC' AT TIME ZONE p_timezone)::DATE = p_date
    ON CONFLICT (field_id, date_local) 
    DO UPDATE SET 
        rainfall_in = EXCLUDED.rainfall_in,
        last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create the definitive JSONB version matching all fixes
CREATE OR REPLACE FUNCTION get_field_rainfall_stats(p_field_id UUID, p_timezone TEXT DEFAULT 'America/Chicago')
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
        'today_in', COALESCE((
            SELECT SUM(rainfall_in) FROM field_rainfall_hourly 
            WHERE field_id = p_field_id AND (timestamp_utc AT TIME ZONE 'UTC' AT TIME ZONE p_timezone)::DATE = CURRENT_DATE
        ), 0),
        'yesterday_in', COALESCE((
            SELECT rainfall_in FROM field_rainfall_daily 
            WHERE field_id = p_field_id AND date_local = (CURRENT_DATE - 1)
        ), 0),
        'last_7_days_in', COALESCE((
            SELECT SUM(rainfall_in) FROM field_rainfall_daily 
            WHERE field_id = p_field_id AND date_local >= (CURRENT_DATE - 7)
        ), 0) + COALESCE((
            SELECT SUM(rainfall_in) FROM field_rainfall_hourly
            WHERE field_id = p_field_id AND (timestamp_utc AT TIME ZONE 'UTC' AT TIME ZONE p_timezone)::DATE = CURRENT_DATE
        ), 0),
        'since_planting_in', CASE 
            WHEN v_planting_date IS NOT NULL THEN
                COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_hourly 
                          WHERE field_id = p_field_id AND timestamp_utc >= v_planting_date), 0)
            ELSE 0
        END,
        'since_last_spray_in', CASE 
            WHEN v_last_spray_date IS NOT NULL THEN
                COALESCE((SELECT SUM(rainfall_in) FROM field_rainfall_hourly 
                          WHERE field_id = p_field_id AND timestamp_utc >= v_last_spray_date), 0)
            ELSE 0
        END,
        'last_updated', (SELECT MAX(timestamp_utc) FROM field_rainfall_hourly WHERE field_id = p_field_id),
        'source', 'NOAA MRMS',
        -- Changed 'not_started' to 'pending' to match TypeScript union type
        'historical_backfill_status', COALESCE((SELECT status FROM field_rainfall_coverage WHERE field_id = p_field_id ORDER BY last_checked_at DESC LIMIT 1), 'pending')
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RLS Policy for field_rainfall_coverage
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'field_rainfall_coverage' AND policyname = 'Allow authenticated read access') THEN
        CREATE POLICY "Allow authenticated read access" ON field_rainfall_coverage FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

COMMIT;
