-- Add harvest_record_id column to grain_movements
-- Date: 2026-07-01
--
-- The harvest-grain linking feature (commit 2d4e7fb) stamps a harvestRecordId
-- on grain movements created from a harvest, and mapGrainToDb() emits the
-- harvest_record_id key on EVERY grain_movements insert. This column was never
-- provisioned in the database, so PostgREST rejected the insert:
--   PGRST204 - "Could not find the 'harvest_record_id' column in the schema cache"
--
-- Why every insert (including outgoing sales) failed: when .insert([...]) is
-- given an array, the Supabase client derives the ?columns= query parameter
-- from Object.keys() of each supplied row, which includes keys whose value is
-- undefined. PostgREST validates that parameter against its schema cache and
-- rejects the request when any listed column does not exist, regardless of the
-- row's actual values. This migration restores schema/code parity.

ALTER TABLE public.grain_movements
  ADD COLUMN IF NOT EXISTS harvest_record_id uuid
  REFERENCES public.harvest_records(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.grain_movements.harvest_record_id IS
  'Optional FK to the harvest_records row that produced this incoming grain movement (harvest-grain linking). NULL for manual adds and outgoing sales.';

-- Support harvest -> linked grain movement lookups.
CREATE INDEX IF NOT EXISTS idx_grain_movements_harvest_record
  ON public.grain_movements(harvest_record_id);
