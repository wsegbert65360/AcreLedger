-- Migration: Align saved_seeds with BLUEPRINT.md
-- Date: 2026-03-20

DO $$
BEGIN
    -- Add crop
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'crop') THEN
        ALTER TABLE saved_seeds ADD COLUMN crop TEXT;
    END IF;

    -- Add variety
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'variety') THEN
        ALTER TABLE saved_seeds ADD COLUMN variety TEXT;
    END IF;

    -- Add supplier
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'supplier') THEN
        ALTER TABLE saved_seeds ADD COLUMN supplier TEXT;
    END IF;

    -- Add lot_number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'lot_number') THEN
        ALTER TABLE saved_seeds ADD COLUMN lot_number TEXT;
    END IF;

    -- Add year
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'year') THEN
        ALTER TABLE saved_seeds ADD COLUMN year INTEGER;
    END IF;

    -- Add notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'saved_seeds' AND column_name = 'notes') THEN
        ALTER TABLE saved_seeds ADD COLUMN notes TEXT;
    END IF;
END $$;
