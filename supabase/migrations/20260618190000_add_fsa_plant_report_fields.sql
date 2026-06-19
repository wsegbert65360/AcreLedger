ALTER TABLE public.plant_records
  ADD COLUMN IF NOT EXISTS crop_status text,
  ADD COLUMN IF NOT EXISTS planting_pattern text;

COMMENT ON COLUMN public.plant_records.crop_status IS 'FSA acreage-report status such as Planted, Prevented Planting, Failed, Volunteer, or Cover Crop.';
COMMENT ON COLUMN public.plant_records.planting_pattern IS 'Optional FSA planting pattern or practice note when applicable.';
