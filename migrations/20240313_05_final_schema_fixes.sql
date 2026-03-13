-- ============================================================
-- REMAINING FIXES MIGRATION
-- Safe to run all at once. All changes are idempotent.
-- Run in Supabase SQL Editor and check NOTICE output.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Fix rainfall_settings primary key to (farm_id, key)
--    Allows each farm to have its own independent settings keys
-- ============================================================
DO $$
BEGIN
    -- Only run if the PK is still just (key)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rainfall_settings_pkey'
        AND conrelid = 'rainfall_settings'::regclass
        AND array_length(conkey, 1) = 1  -- single-column PK
    ) THEN
        ALTER TABLE rainfall_settings DROP CONSTRAINT rainfall_settings_pkey;
        ALTER TABLE rainfall_settings ADD PRIMARY KEY (farm_id, key);
        RAISE NOTICE 'rainfall_settings: primary key updated to (farm_id, key)';
    ELSE
        RAISE NOTICE 'rainfall_settings: primary key already correct — skipped';
    END IF;
END $$;


-- ============================================================
-- 2. Make rainfall_settings.farm_id NOT NULL
-- ============================================================
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count 
    FROM rainfall_settings WHERE farm_id IS NULL;

    IF null_count > 0 THEN
        -- Try to assign any NULLs to the single existing farm
        UPDATE rainfall_settings 
        SET farm_id = (SELECT id FROM farms LIMIT 1)
        WHERE farm_id IS NULL;
        RAISE NOTICE 'rainfall_settings: backfilled % NULL farm_id row(s)', null_count;
    END IF;

    -- Now apply NOT NULL
    ALTER TABLE rainfall_settings ALTER COLUMN farm_id SET NOT NULL;
    RAISE NOTICE 'rainfall_settings: farm_id is now NOT NULL';
END $$;


-- ============================================================
-- 3. Add unique constraint to field_rainfall_hourly
--    Prevents duplicate rainfall rows from double-ingestion
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
        -- Check for duplicates first
        SELECT COUNT(*) INTO dup_count
        FROM (
            SELECT field_id, timestamp_utc
            FROM field_rainfall_hourly
            GROUP BY field_id, timestamp_utc
            HAVING COUNT(*) > 1
        ) dupes;

        IF dup_count > 0 THEN
            RAISE NOTICE 'field_rainfall_hourly: found % duplicate (field_id, timestamp_utc) pairs — deduplicating...', dup_count;
            -- Keep only the row with the lowest UUID per duplicate group
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
        RAISE NOTICE 'field_rainfall_hourly: unique constraint already exists — skipped';
    END IF;
END $$;


-- ============================================================
-- 4. Audit spray_records product vs products columns
--    Reports counts so you can decide which column to drop.
--    Does NOT drop anything — manual step after reviewing output.
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

    IF product_count = 0 AND products_count > 0 THEN
        RAISE NOTICE 'RECOMMENDATION: product column appears unused. Safe to run: ALTER TABLE spray_records DROP COLUMN product;';
    ELSIF products_count = 0 AND product_count > 0 THEN
        RAISE NOTICE 'RECOMMENDATION: products column appears unused. Safe to run: ALTER TABLE spray_records DROP COLUMN products;';
    ELSE
        RAISE NOTICE 'RECOMMENDATION: Both columns have data — manual review required before dropping either.';
    END IF;
END $$;

COMMIT;
