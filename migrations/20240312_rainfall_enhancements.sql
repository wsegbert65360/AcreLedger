-- Migration: Rainfall enhancements for historical backfill and rollups

-- Table for tracking data coverage and gaps per field
CREATE TABLE IF NOT EXISTS field_rainfall_coverage (
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    range_start_utc TIMESTAMPTZ NOT NULL,
    range_end_utc TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (field_id, range_start_utc)
);

-- Table for daily rollups
CREATE TABLE IF NOT EXISTS field_rainfall_daily (
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    date_local DATE NOT NULL,
    rainfall_mm DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
    source VARCHAR(50) NOT NULL DEFAULT 'MRMS',
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (field_id, date_local)
);

-- Optimize daily lookups
CREATE INDEX IF NOT EXISTS idx_field_rainfall_daily_date ON field_rainfall_daily(field_id, date_local);

-- Update field_rainfall_hourly to ensure source and finalized are consistent
ALTER TABLE field_rainfall_hourly ALTER COLUMN source SET DEFAULT 'MRMS';
ALTER TABLE field_rainfall_hourly ALTER COLUMN finalized SET DEFAULT FALSE;
