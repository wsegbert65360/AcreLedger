-- SUPERSEDED for existing projects by 20261017041928_apply_missing_safeguards.sql. Never applied in production (audit 2026-10-17). Do not db push this out-of-order file to prod; after applying the consolidated migration, mark this version applied with supabase migration repair --status applied 20260928233016. Kept unchanged for fresh replay (supabase db reset / verify:migrations); the consolidated migration is idempotent so it is a no-op after this file runs.
--
-- Revoke the legacy anonymous SELECT grant from the core farm-owned tables.
--
-- 20260513100000 and 20260628100000 granted SELECT to `anon` on these tables. Every RLS
-- policy targets `authenticated`, so the grant exposed no rows, but it widened the Data API
-- surface and contradicts the strict new-table template (see BLUEPRINT -> Data API Access).
-- Newer farm tables (`custom_spray_records`, `work_requests`) already carry no anon access.
--
-- Deliberately out of scope: `farms`, `profiles`, and the rainfall tables
-- (`field_rainfall_hourly`, `field_rainfall_coverage`, `farm_rainfall_daily`). Their anon
-- grants need a separate review because external callers (e.g. the Rain API) may rely on them.

DO $$
DECLARE
    t text;
    core_farm_tables text[] := ARRAY[
        'fields',
        'bins',
        'plant_records',
        'spray_records',
        'harvest_records',
        'hay_harvest_records',
        'fertilizer_applications',
        'tillage_records',
        'grain_movements',
        'saved_seeds',
        'fertilizer_recipes',
        'spray_recipes'
    ];
BEGIN
    FOREACH t IN ARRAY core_farm_tables LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END LOOP;

    -- Fail closed if any anon table privilege survived (e.g. via a column grant).
    FOREACH t IN ARRAY core_farm_tables LOOP
        IF has_table_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE, DELETE')
           OR has_any_column_privilege('anon', format('public.%I', t), 'SELECT, INSERT, UPDATE') THEN
            RAISE EXCEPTION 'anon still has privileges on public.%', t;
        END IF;
    END LOOP;
END $$;
