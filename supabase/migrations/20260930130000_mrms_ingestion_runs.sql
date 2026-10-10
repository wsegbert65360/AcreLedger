-- MRMS scheduled-ingestion outcome ledger.
--
-- Every scheduled invocation (the hourly pass and the nightly backfill) records
-- its outcome here, keyed by the hour it processed. Before this table the
-- nightly job ran with field_id = null and persisted nothing on failure, so a
-- decode or Pass-1 download failure left no state and the hour was silently
-- never retried. Coverage rows in public.field_rainfall_coverage only exist for
-- field-scoped requests, so they cannot carry a scheduled run's state.
--
-- One row per target hour: the latest outcome wins. A later success therefore
-- clears an earlier failure, so the retry sweep (status IN ('failed','no_data'))
-- cannot resurrect an hour that has since been filled.
--
-- Operational infrastructure, not farm-owned: service-role (Edge Function) only,
-- never exposed to the Data API, never part of a customer or tenant backup.

CREATE TABLE IF NOT EXISTS public.mrms_ingestion_runs (
    target_hour TIMESTAMPTZ PRIMARY KEY,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT,
    field_count INTEGER,
    record_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mrms_ingestion_runs_run_type_check
        CHECK (run_type IN ('hourly', 'overnight', 'backfill')),
    CONSTRAINT mrms_ingestion_runs_status_check
        CHECK (status IN ('success', 'no_data', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_mrms_ingestion_runs_status
    ON public.mrms_ingestion_runs (status, target_hour DESC);

ALTER TABLE public.mrms_ingestion_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mrms_ingestion_runs FROM anon, authenticated;
GRANT ALL ON TABLE public.mrms_ingestion_runs TO service_role;

COMMENT ON TABLE public.mrms_ingestion_runs IS
    'MRMS scheduled-ingestion outcome ledger keyed by target hour; service_role only, never exposed to clients.';
