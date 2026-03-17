-- Migration: Add scale_ticket_number to harvest_records
-- Date: 2026-03-17

ALTER TABLE harvest_records ADD COLUMN scale_ticket_number TEXT;
