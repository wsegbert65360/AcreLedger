ALTER TABLE public.plant_records
  ADD COLUMN IF NOT EXISTS crop_sequence text DEFAULT 'First Crop';

COMMENT ON COLUMN public.plant_records.crop_sequence IS 'FSA crop sequence for planted acreage, such as First Crop or Second Crop.';