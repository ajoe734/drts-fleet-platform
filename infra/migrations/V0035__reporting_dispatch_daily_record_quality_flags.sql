-- V0035__reporting_dispatch_daily_record_quality_flags.sql
--
-- Daily dispatch records need to preserve rebuild quality markers from
-- event-history reconstruction. ARRIVAL_EVENT_MISSING is emitted when a task
-- has no explicit arrived_pickup event; the record must keep arrived_pickup_at
-- null instead of inferring it from later trip transitions.

ALTER TABLE reporting.dispatch_daily_records
  ADD COLUMN IF NOT EXISTS quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
