-- V0016__driver_attendance_settings.sql
--
-- W8-001E: Ops and driver domain completion
-- Attendance and driver settings tables to complement the ops.phase1_driver_shifts
-- table added in V0015. All tables follow the jsonb-record snapshot pattern.

-- ── Driver Attendance ────────────────────────────────────────────────────────
-- One attendance record is written per clock-out, summarising the full shift.
-- Source: Phase 1 PRD §9.4.7 (Shift & Attendance - Driver App)

CREATE TABLE IF NOT EXISTS ops.phase1_driver_attendance (
  attendance_id   varchar(100) PRIMARY KEY,
  driver_id       varchar(100) NOT NULL,
  shift_id        varchar(100) NOT NULL REFERENCES ops.phase1_driver_shifts(shift_id),
  date            date NOT NULL,            -- calendar date of the shift (YYYY-MM-DD)
  status          varchar(30) NOT NULL,     -- present | partial | absent
  clock_in_at     timestamptz NOT NULL,
  clock_out_at    timestamptz,
  record          jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_attendance_driver
  ON ops.phase1_driver_attendance(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_attendance_date
  ON ops.phase1_driver_attendance(date DESC);

CREATE INDEX IF NOT EXISTS idx_driver_attendance_shift
  ON ops.phase1_driver_attendance(shift_id);

-- ── Driver Settings ──────────────────────────────────────────────────────────
-- One row per driver; upserted on every settings update.
-- Source: Phase 1 PRD §9.4.8 (Settings - Driver App)

CREATE TABLE IF NOT EXISTS ops.phase1_driver_settings (
  driver_id   varchar(100) PRIMARY KEY,
  updated_at  timestamptz NOT NULL,
  record      jsonb NOT NULL
);
