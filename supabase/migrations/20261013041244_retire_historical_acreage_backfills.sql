-- Retire the July 2026 spray, fertilizer and planting acreage backfills.
-- The historical migrations remain in history, with guarded original SQL.
-- Their initial updates lost deliberate partial areas; no restoration is
-- attempted here. Historical data repair remains an explicit owner decision.
-- A private, data-free marker also guards restored databases whose Supabase
-- migration ledger is absent. It changes no farm data, grants, or RLS.
CREATE SCHEMA IF NOT EXISTS acreage_backfill_private;
CREATE OR REPLACE FUNCTION acreage_backfill_private.historical_backfills_retired()
RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
COMMENT ON FUNCTION acreage_backfill_private.historical_backfills_retired() IS
  'Retirement guard for 20260713120000, 20260715120000, 20260715130000. Never rerun their historical acreage updates or use them as data repair.';
