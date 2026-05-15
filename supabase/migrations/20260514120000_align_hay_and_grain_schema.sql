-- Schema Audit Fixes: Alignment with BLUEPRINT.md and Frontend Models
-- Date: 2026-05-14
-- Restores missing columns for Hay Harvest and Grain Movements

-- 1. Hay Harvest Records
ALTER TABLE public.hay_harvest_records 
ADD COLUMN IF NOT EXISTS temperature numeric,
ADD COLUMN IF NOT EXISTS conditions text;

COMMENT ON COLUMN public.hay_harvest_records.temperature IS 'Air temperature during hay cutting/baling.';
COMMENT ON COLUMN public.hay_harvest_records.conditions IS 'Weather or field conditions during harvest.';

-- 2. Grain Movement Records
ALTER TABLE public.grain_movements 
ADD COLUMN IF NOT EXISTS price numeric,
ADD COLUMN IF NOT EXISTS destination text;

COMMENT ON COLUMN public.grain_movements.price IS 'Price per bushel for sales or contracts.';
COMMENT ON COLUMN public.grain_movements.destination IS 'Buyer, elevator, or end location for grain.';
