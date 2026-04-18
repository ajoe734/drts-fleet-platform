-- V0019__driver_locations.sql
--
-- GAP-P2S2-003: persist the latest known driver coordinates as a
-- single-row-per-driver snapshot for heartbeat upserts and ETA lookups.

CREATE TABLE IF NOT EXISTS ops.phase1_driver_locations (
  driver_id    text PRIMARY KEY,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  accuracy_m   double precision,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_updated_at
  ON ops.phase1_driver_locations(updated_at DESC);
