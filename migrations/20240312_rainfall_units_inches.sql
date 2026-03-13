-- Migration: Convert rainfall units from mm to inches
-- Date: 2024-03-12

BEGIN;

-- 1. Rename columns in field_rainfall_hourly
ALTER TABLE field_rainfall_hourly RENAME COLUMN rainfall_mm TO rainfall_in;

-- 2. Rename columns in field_rainfall_daily
ALTER TABLE field_rainfall_daily RENAME COLUMN rainfall_mm TO rainfall_in;

-- 3. Update the rollup function to use inches
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
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update the statistics function
CREATE OR REPLACE FUNCTION get_field_rainfall_stats(p_field_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
    total_in NUMERIC,
    avg_daily_in NUMERIC,
    max_hourly_in NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(rainfall_in), 0) as total_in,
        COALESCE(AVG(rainfall_in), 0) as avg_daily_in,
        (SELECT COALESCE(MAX(rainfall_in), 0) FROM field_rainfall_hourly WHERE field_id = p_field_id AND timestamp_utc > NOW() - (p_days || ' days')::INTERVAL) as max_hourly_in
    FROM field_rainfall_daily
    WHERE field_id = p_field_id 
      AND date_local > CURRENT_DATE - p_days;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Convert existing data (optional but recommended for consistency)
UPDATE field_rainfall_hourly SET rainfall_in = rainfall_in * 0.0393701;
UPDATE field_rainfall_daily SET rainfall_in = rainfall_in * 0.0393701;

COMMIT;
