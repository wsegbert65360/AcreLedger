-- Australia pilot: persist water rate and PIC on spray records.
--
-- The au-apvma compliance profile requires water rate (carrier volume) and
-- Property Identification Code on every spray record. These columns give them
-- a persistent representation. The PIC is denormalized from the field at
-- record creation time (NSW EPA requires it on the spray record itself).

ALTER TABLE public.spray_records ADD COLUMN IF NOT EXISTS water_rate TEXT;
ALTER TABLE public.spray_records ADD COLUMN IF NOT EXISTS water_rate_unit TEXT;
ALTER TABLE public.spray_records ADD COLUMN IF NOT EXISTS pic TEXT;
