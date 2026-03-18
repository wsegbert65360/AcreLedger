-- ============================================================
-- SCHEMA AUDIT FIXES MIGRATION (CORRECTED)
-- Applies recommended fixes from the database audit
-- Safe to re-run — all changes are idempotent
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 🔴 Critical — Add unique constraint to field_rainfall_hourly
-- Prevents duplicate rows if MRMS backfill runs twice for the same hour.
-- Uses MIN(id) deduplication — stable and handles 3+ duplicates correctly.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'field_rainfall_hourly_field_time_unique'
    ) THEN
        -- Deduplicate: keep one row per (field_id, timestamp_utc), prefer lowest UUID
        DELETE FROM field_rainfall_hourly
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM field_rainfall_hourly
            GROUP BY field_id, timestamp_utc
        );

        -- Now safe to add the constraint
        ALTER TABLE field_rainfall_hourly 
        ADD CONSTRAINT field_rainfall_hourly_field_time_unique 
        UNIQUE (field_id, timestamp_utc);
    END IF;
END $$;


-- ============================================================
-- 2. 🔴 Critical — Add farm_id to rainfall_settings
-- Prevents settings collisions if multiple farms ever share this instance.
-- Also updates the primary key to (farm_id, key) so each farm has its own.
-- ============================================================
DO $$
BEGIN
    -- Step A: Add farm_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rainfall_settings' AND column_name = 'farm_id'
    ) THEN
        ALTER TABLE rainfall_settings ADD COLUMN farm_id uuid REFERENCES public.farms(id);

        -- Backfill: assign all existing rows to the current single farm
        UPDATE rainfall_settings 
        SET farm_id = (SELECT id FROM farms LIMIT 1) 
        WHERE farm_id IS NULL;

        -- Lock it down — no new rows without a farm_id
        ALTER TABLE rainfall_settings ALTER COLUMN farm_id SET NOT NULL;

        -- Update primary key to be (farm_id, key) so each farm has its own keys
        ALTER TABLE rainfall_settings DROP CONSTRAINT rainfall_settings_pkey;
        ALTER TABLE rainfall_settings ADD PRIMARY KEY (farm_id, key);
    END IF;
END $$;


-- ============================================================
-- 3. 🟡 Warning — profiles.active_season hardcoded to 2026
-- Updates the default to use current year automatically going forward.
-- Also updates any existing profiles still set to 2026.
-- Remove the UPDATE below if you want to preserve users' current season choice.
-- ============================================================
ALTER TABLE profiles 
ALTER COLUMN active_season SET DEFAULT EXTRACT(YEAR FROM NOW())::integer;

UPDATE profiles 
SET active_season = EXTRACT(YEAR FROM NOW())::integer
WHERE active_season = 2026;


-- ============================================================
-- 4. 🟡 Warning — Record tables field_id nullable
-- Makes field_id NOT NULL on primary record tables to prevent orphaned records.
-- Only applies if no existing orphans exist — fails safely if cleanup needed first.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM harvest_records WHERE field_id IS NULL) THEN
        ALTER TABLE harvest_records ALTER COLUMN field_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'harvest_records has NULL field_id rows — skipping NOT NULL constraint. Clean up orphans first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM plant_records WHERE field_id IS NULL) THEN
        ALTER TABLE plant_records ALTER COLUMN field_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'plant_records has NULL field_id rows — skipping NOT NULL constraint. Clean up orphans first.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM spray_records WHERE field_id IS NULL) THEN
        ALTER TABLE spray_records ALTER COLUMN field_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'spray_records has NULL field_id rows — skipping NOT NULL constraint. Clean up orphans first.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'hay_harvest_records'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM hay_harvest_records WHERE field_id IS NULL) THEN
            ALTER TABLE hay_harvest_records ALTER COLUMN field_id SET NOT NULL;
        ELSE
            RAISE NOTICE 'hay_harvest_records has NULL field_id rows — skipping NOT NULL constraint. Clean up orphans first.';
        END IF;
    END IF;
END $$;


-- ============================================================
-- 5. 🔵 Minor — Add updated_at to field_rainfall_hourly
-- Useful for debugging sync and backfill issues.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'field_rainfall_hourly' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE field_rainfall_hourly 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Trigger function to auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

-- Attach trigger to field_rainfall_hourly (safe to re-run)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'update_field_rainfall_hourly_modtime'
          AND event_object_table = 'field_rainfall_hourly'
    ) THEN
        CREATE TRIGGER update_field_rainfall_hourly_modtime
        BEFORE UPDATE ON field_rainfall_hourly
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;


-- ============================================================
-- NOTE: Two items intentionally left for manual review
-- ============================================================
-- A) spray_records.product (text) vs spray_records.products (jsonb)
--    Audit which column the app is reading/writing, then drop the dead one:
--    ALTER TABLE spray_records DROP COLUMN product;   -- if products jsonb is used
--    ALTER TABLE spray_records DROP COLUMN products;  -- if product text is used
--
-- B) Denormalized field_name text columns on harvest/spray/plant/hay records
--    These are fine if intentional (preserving name at time of record).
--    If accidental, remove them and JOIN to fields.name at query time instead.
-- ============================================================

COMMIT;