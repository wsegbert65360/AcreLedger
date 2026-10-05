-- Australia pilot: persist the Property Identification Code (PIC) per field.
--
-- Phase 2a introduced propertyIdentifiers with an 'au-pic' scheme, but the
-- mappers only round-tripped us-fsa identifiers through the fsa_* columns, so
-- an au-pic value had no persistent representation and was lost on reload.
-- This column gives it one. The app-level Field type is unchanged: PIC travels
-- inside propertyIdentifiers and the mappers translate to/from this column.
-- US behavior is untouched (pic stays null for US fields).

ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS pic TEXT;
