-- Migration: Add landlord_name to fields
-- Date: 2026-07-11
-- Purpose: field-level owner/landlord so the Landlord Summary report can
-- attribute all field activity (plant/spray/fertilize/harvest) and yield
-- (bu/acre) to a landlord regardless of whether a harvest record carries one.
ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS landlord_name TEXT;
