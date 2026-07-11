-- Add operational_acreage to fields table
-- Date: 2026-06-29

-- 1. Add column with default 0
ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS operational_acreage NUMERIC NOT NULL DEFAULT 0;

-- 2. Seed operational_acreage with current acreage
UPDATE public.fields SET operational_acreage = acreage;

-- 3. Explicitly grant permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.fields TO authenticated;
GRANT ALL ON TABLE public.fields TO service_role;
