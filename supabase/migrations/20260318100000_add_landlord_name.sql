-- Migration: Add landlord_name to harvest_records
-- Date: 2026-03-18

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'harvest_records' AND column_name = 'landlord_name'
    ) THEN
        ALTER TABLE harvest_records ADD COLUMN landlord_name TEXT;
    END IF;
END $$;
