-- AcreLedger v3.0.0 - Fertilizer Recipes & Tillage Records
-- Date: 2026-03-24

-- 1. Create fertilizer_recipes table
CREATE TABLE IF NOT EXISTS public.fertilizer_recipes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    npk_ratio text NOT NULL,
    created_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- 2. Create tillage_records table
CREATE TABLE IF NOT EXISTS public.tillage_records (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    farm_id uuid REFERENCES public.farms(id) ON DELETE CASCADE NOT NULL,
    field_id uuid REFERENCES public.fields(id) ON DELETE CASCADE NOT NULL,
    date date NOT NULL,
    implement_type text NOT NULL,
    notes text,
    season_year integer NOT NULL,
    timestamp timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- 3. Enable RLS
ALTER TABLE public.fertilizer_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tillage_records ENABLE ROW LEVEL SECURITY;

-- 4. Polices for fertilizer_recipes
CREATE POLICY "Users can manage their own fertilizer recipes"
ON public.fertilizer_recipes
FOR ALL
USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));

-- 5. Polices for tillage_records
CREATE POLICY "Users can manage their own tillage records"
ON public.tillage_records
FOR ALL
USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
