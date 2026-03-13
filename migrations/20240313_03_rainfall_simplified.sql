-- ============================================================
-- RAINFALL SIMPLIFICATION MIGRATION
-- - Drops daily rollup (no longer needed)
-- - Rewrites get_field_rainfall_stats to 24h / 72h / 7-day
-- - All queries run from field_rainfall_hourly only
-- - Adds 7-day retention cleanup function + cron job
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Drop daily rollup infrastructure (no longer needed)
-- ============================================================
DROP FUNCTION IF EXISTS rollup_field_rainfall(UUID, DATE);
DROP TABLE IF EXISTS field_rainfall_daily;


-- ============================================================
-- 2. Drop all previous variants of get_field_rainfall_stats
-- ============================================================
DROP FUNCTION IF EXISTS get_field_rainfall_stats(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(UUID);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(p_field_id UUID);
DROP FUNCTION IF EXISTS get_field_rainfall_stats(p_field_id UUID, p_days INTEGER);


-- ============================================================
-- 3. Simplified stats function — hourly table only
--    Returns: last_24h_in, last_72h_in, last_7_days_in
-- ============================================================
CREATE OR REPLACE FUNCTION get_field_rainfall_stats(p_field_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'last_24h_in',   COALESCE((
            SELECT ROUND(SUM(rainfall_in)::NUMERIC, 2)
            FROM field_rainfall_hourly
            WHERE field_id = p_field_id
              AND timestamp_utc >= v_now - INTERVAL '24 hours'
        ), 0),

        'last_72h_in',   COALESCE((
            SELECT ROUND(SUM(rainfall_in)::NUMERIC, 2)
            FROM field_rainfall_hourly
            WHERE field_id = p_field_id
              AND timestamp_utc >= v_now - INTERVAL '72 hours'
        ), 0),

        'last_7_days_in', COALESCE((
            SELECT ROUND(SUM(rainfall_in)::NUMERIC, 2)
            FROM field_rainfall_hourly
            WHERE field_id = p_field_id
              AND timestamp_utc >= v_now - INTERVAL '7 days'
        ), 0),

        'last_updated', (
            SELECT MAX(timestamp_utc)
            FROM field_rainfall_hourly
            WHERE field_id = p_field_id
        ),

        'source', 'NOAA MRMS',

        'backfill_status', COALESCE((
            SELECT status
            FROM field_rainfall_coverage
            WHERE field_id = p_field_id
            ORDER BY last_checked_at DESC
            LIMIT 1
        ), 'not_started')

    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 4. Retention cleanup function — deletes rows older than 7 days
--    Safe to run anytime; called by cron job below
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_rainfall()
RETURNS void AS $$
BEGIN
    DELETE FROM field_rainfall_hourly
    WHERE timestamp_utc < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 5. Schedule cleanup to run nightly at 2am UTC
--    Requires pg_cron extension (enabled by default on Supabase)
-- ============================================================
SELECT cron.schedule(
    'cleanup-old-rainfall',        -- job name
    '0 2 * * *',                   -- every day at 2:00am UTC
    $$SELECT cleanup_old_rainfall()$$
);


-- ============================================================
-- 6. RLS Policies
-- ============================================================
ALTER TABLE field_rainfall_hourly   ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_rainfall_coverage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- field_rainfall_hourly read policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'field_rainfall_hourly' 
        AND policyname = 'Allow authenticated read access'
    ) THEN
        CREATE POLICY "Allow authenticated read access"
        ON field_rainfall_hourly FOR SELECT TO authenticated USING (true);
    END IF;

    -- field_rainfall_coverage read policy (was missing before)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'field_rainfall_coverage' 
        AND policyname = 'Allow authenticated read access'
    ) THEN
        CREATE POLICY "Allow authenticated read access"
        ON field_rainfall_coverage FOR SELECT TO authenticated USING (true);
    END IF;
END $$;


-- ============================================================
-- 7. Index to keep 7-day queries fast
--    (skip if index already exists)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rainfall_hourly_field_time
ON field_rainfall_hourly (field_id, timestamp_utc DESC);

COMMIT;
