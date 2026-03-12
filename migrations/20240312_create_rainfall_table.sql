-- Migration: Create hourly rainfall tracking table for NOAA MRMS data
-- Stores rainfall in millimeters (mm)

CREATE TABLE IF NOT EXISTS field_rainfall_hourly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    timestamp_utc TIMESTAMPTZ NOT NULL,
    rainfall_mm DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
    source VARCHAR(50) NOT NULL DEFAULT 'MRMS',
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure we don't duplicate processing for the same field/hour
    UNIQUE(field_id, timestamp_utc)
);

-- Index for efficient range queries (e.g., today, last 7 days)
CREATE INDEX IF NOT EXISTS idx_field_rainfall_timestamp ON field_rainfall_hourly(field_id, timestamp_utc);
