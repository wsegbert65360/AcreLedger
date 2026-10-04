-- Migration: Add move_reason to harvest_records
-- Date: 2026-09-26
-- Optional audit note recorded when a harvest truckload is reassigned to a
-- different field. Nullable; existing rows stay NULL.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'harvest_records' AND column_name = 'move_reason'
    ) THEN
        ALTER TABLE harvest_records ADD COLUMN move_reason TEXT;
    END IF;
END $$;
