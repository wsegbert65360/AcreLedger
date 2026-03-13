-- ============================================================
-- FINAL CLEANUP MIGRATION
-- 1. Fix fertilizer_applications.season_year hardcoded default
-- 2. Drop unused spray_records column (product or products)
-- 3. Verify field_rainfall_hourly unique constraint exists
-- Safe to run all at once. All changes are idempotent.
-- ============================================================
 
BEGIN;
 
-- ============================================================
-- 1. Fix fertilizer_applications.season_year default
--    Changes hardcoded 2026 to dynamic current year
-- ============================================================
DO $$
BEGIN
    ALTER TABLE fertilizer_applications
    ALTER COLUMN season_year SET DEFAULT EXTRACT(YEAR FROM NOW())::integer;
    RAISE NOTICE 'fertilizer_applications: season_year default updated to dynamic current year';
END $$;
 
 
-- ============================================================
-- 2. Drop unused spray_records column
--    Audits both columns and drops whichever is empty.
--    If both have data, prints a warning and drops nothing.
-- ============================================================
DO $$
DECLARE
    product_count  INTEGER;
    products_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO product_count  FROM spray_records WHERE product  IS NOT NULL;
    SELECT COUNT(*) INTO products_count FROM spray_records WHERE products IS NOT NULL;
 
    RAISE NOTICE '--- spray_records column audit ---';
    RAISE NOTICE 'product  (text): % rows with data', product_count;
    RAISE NOTICE 'products (jsonb): % rows with data', products_count;
 
    IF product_count = 0 THEN
        ALTER TABLE spray_records DROP COLUMN IF EXISTS product;
        RAISE NOTICE 'spray_records: dropped unused column "product" (text)';
 
    ELSIF products_count = 0 THEN
        ALTER TABLE spray_records DROP COLUMN IF EXISTS products;
        RAISE NOTICE 'spray_records: dropped unused column "products" (jsonb)';
 
    ELSE
        RAISE NOTICE 'WARNING: Both columns have data — nothing dropped. Manual review required.';
    END IF;
END $$;
 
 
-- ============================================================
-- 3. Verify field_rainfall_hourly unique constraint exists
--    Adds it if missing, deduplicates first if needed
-- ============================================================
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'field_rainfall_hourly'::regclass
        AND contype = 'u'
        AND conname = 'field_rainfall_hourly_field_time_unique'
    ) THEN
        SELECT COUNT(*) INTO dup_count
        FROM (
            SELECT field_id, timestamp_utc
            FROM field_rainfall_hourly
            GROUP BY field_id, timestamp_utc
            HAVING COUNT(*) > 1
        ) dupes;
 
        IF dup_count > 0 THEN
            RAISE NOTICE 'field_rainfall_hourly: found % duplicate pairs — deduplicating...', dup_count;
            DELETE FROM field_rainfall_hourly
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM field_rainfall_hourly
                GROUP BY field_id, timestamp_utc
            );
        END IF;
 
        ALTER TABLE field_rainfall_hourly
        ADD CONSTRAINT field_rainfall_hourly_field_time_unique
        UNIQUE (field_id, timestamp_utc);
 
        RAISE NOTICE 'field_rainfall_hourly: unique constraint added';
    ELSE
        RAISE NOTICE 'field_rainfall_hourly: unique constraint already present — skipped';
    END IF;
END $$;
 
COMMIT;
