-- ── Driver Matching Suppression (Q-OPS09) ───────────────────────────
-- Source: docs/05-ui/system-design-answers-all-apps-20260524.md §Q-OPS09
--
-- When an incident is opened against a driver, dispatch matching for that
-- driver is suppressed. Suppression is time-bound: it auto-expires after the
-- default TTL (24h) and is lifted early when the source incident is resolved
-- or closed. Only an ops_manager may extend the window beyond the default cap.

CREATE TABLE IF NOT EXISTS ops.phase1_driver_matching_suppressions (
  suppression_id     varchar(100) PRIMARY KEY,
  driver_id          varchar(100) NOT NULL,
  active             boolean NOT NULL,
  reason_code        varchar(50) NOT NULL,   -- incident, compliance_hold, manual_ops_hold
  source_incident_id varchar(100),
  expires_at         timestamptz NOT NULL,
  lifted_at          timestamptz,
  created_by         varchar(100),
  extended_by        varchar(100),
  created_at         timestamptz NOT NULL,
  updated_at         timestamptz NOT NULL,
  record             jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_driver
  ON ops.phase1_driver_matching_suppressions(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_active
  ON ops.phase1_driver_matching_suppressions(driver_id, active);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_incident
  ON ops.phase1_driver_matching_suppressions(source_incident_id);
