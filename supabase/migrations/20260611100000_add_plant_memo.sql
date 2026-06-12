-- Migration: Add memo column to plant_records
-- Date: 2026-06-11

ALTER TABLE public.plant_records ADD COLUMN IF NOT EXISTS memo text;

COMMENT ON COLUMN public.plant_records.memo IS 'Optional free-text memo for planting notes.';
