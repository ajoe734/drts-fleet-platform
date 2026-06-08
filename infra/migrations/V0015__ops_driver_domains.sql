-- V0015__ops_driver_domains.sql
--
-- W8-001E: Ops and driver domain completion
-- Dedicated tables for incidents, maintenance logs, and driver shift/attendance.
-- These use the same jsonb-record pattern as existing Phase 1 snapshot tables.

-- ── Incident Management ──────────────────────────────────────────────
-- Incidents are separate from complaints (different lifecycles, can be cross-referenced).
-- Source: Phase 1 PRD §9.5.5 (Incident Reporting - Ops Console), §9.4.5 (SOS & Incident Report - Driver App)

CREATE TABLE IF NOT EXISTS ops.phase1_incidents (
  incident_id   varchar(100) PRIMARY KEY,
  incident_no   varchar(100) NOT NULL UNIQUE,
  status        varchar(50) NOT NULL,
  severity      varchar(30) NOT NULL,
  category      varchar(50) NOT NULL,
  reported_by   varchar(100),          -- driver_id or ops_user_id
  related_order_id varchar(100),
  related_vehicle_id varchar(100),
  related_complaint_no varchar(100),
  assigned_to   varchar(100),
  description   text NOT NULL,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  closed_at     timestamptz,
  record        jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_incident_timelines (
  entry_id      varchar(100) PRIMARY KEY,
  incident_id   varchar(100) NOT NULL REFERENCES ops.phase1_incidents(incident_id),
  action        varchar(50) NOT NULL,
  note          text,
  actor_id      varchar(100),
  created_at    timestamptz NOT NULL,
  record        jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_driver_matching_suppressions (
  source_incident_id varchar(100) PRIMARY KEY REFERENCES ops.phase1_incidents(incident_id),
  driver_id          varchar(100) NOT NULL,
  active             boolean NOT NULL,
  reason_code        varchar(50) NOT NULL,
  expires_at         timestamptz NOT NULL,
  lifted_at          timestamptz,
  updated_at         timestamptz NOT NULL,
  record             jsonb NOT NULL
);

-- ── Maintenance Logs ─────────────────────────────────────────────────
-- Source: Phase 1 PRD §9.5.4 (Maintenance Logs - Ops Console)

CREATE TABLE IF NOT EXISTS ops.phase1_maintenance_logs (
  log_id          varchar(100) PRIMARY KEY,
  vehicle_id      varchar(100) NOT NULL,
  vehicle_reg_no  varchar(100),
  status          varchar(30) NOT NULL,  -- scheduled, in_progress, completed, cancelled
  maintenance_type varchar(50) NOT NULL,
  description     text NOT NULL,
  scheduled_date  date,
  completed_date  date,
  next_maintenance_date date,
  cost_amount     numeric(12,2),
  currency_code   varchar(10) DEFAULT 'TWD',
  attachment_urls text[],
  recorded_by     varchar(100),
  notes           text,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  record          jsonb NOT NULL
);

-- ── Driver Shift / Attendance ────────────────────────────────────────
-- Source: Phase 1 PRD §9.4.7 (Shift & Attendance - Driver App),
--           Phase 1 Service Contracts §3.8 (Driver Task Service)

CREATE TABLE IF NOT EXISTS ops.phase1_driver_shifts (
  shift_id      varchar(100) PRIMARY KEY,
  shift_no      varchar(100) NOT NULL UNIQUE,
  driver_id     varchar(100) NOT NULL,
  vehicle_id    varchar(100),
  status        varchar(30) NOT NULL,  -- clocked_in, clocked_out, on_break
  clock_in_at   timestamptz NOT NULL,
  clock_out_at  timestamptz,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  break_start   timestamptz,
  break_end     timestamptz,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  record        jsonb NOT NULL
);

-- ── Index helpers for common queries ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON ops.phase1_incidents(status);

CREATE INDEX IF NOT EXISTS idx_incidents_created_at
  ON ops.phase1_incidents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_reported_by
  ON ops.phase1_incidents(reported_by);

CREATE INDEX IF NOT EXISTS idx_incident_timelines_incident
  ON ops.phase1_incident_timelines(incident_id);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_driver
  ON ops.phase1_driver_matching_suppressions(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_matching_suppressions_active
  ON ops.phase1_driver_matching_suppressions(active, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle
  ON ops.phase1_maintenance_logs(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_status
  ON ops.phase1_maintenance_logs(status);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver
  ON ops.phase1_driver_shifts(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_status
  ON ops.phase1_driver_shifts(status);
