-- Migration: Add notes column to fields table
ALTER TABLE fields ADD COLUMN IF NOT EXISTS notes TEXT;
