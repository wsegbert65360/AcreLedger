-- Migration: Add scale_ticket_number to harvest_records
-- Date: 2026-03-17

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'harvest_records' AND column_name = 'scale_ticket_number'
    ) THEN
        ALTER TABLE harvest_records ADD COLUMN scale_ticket_number TEXT;
    END IF;
END $$;
