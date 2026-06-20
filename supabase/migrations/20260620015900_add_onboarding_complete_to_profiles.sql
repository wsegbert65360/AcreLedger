-- ===========================================================================
-- Onboarding Durability Migration
-- Purpose: Add onboarding_complete column to user profiles
-- ===========================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
