-- V0025__driver_matching_suppressions.sql
--
-- Persist standalone DriverMatchingSuppression records introduced by the
-- 2026-05-24 driver-platform-binding contract pack.

CREATE TABLE IF NOT EXISTS ops.phase1_driver_matching_suppressions (
  suppression_id       varchar(100) PRIMARY KEY,
  driver_id            varchar(100) NOT NULL,
  platform_code        varchar(50),
  service_bucket       varchar(100),
  reason               varchar(50) NOT NULL,
  reason_message       text NOT NULL,
  status               varchar(20) NOT NULL,
  created_at           timestamptz NOT NULL,
  released_at          timestamptz,
  created_by_actor_id  varchar(100),
  record               jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_driver_created
  ON ops.phase1_driver_matching_suppressions(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_status_created
  ON ops.phase1_driver_matching_suppressions(status, created_at DESC);
