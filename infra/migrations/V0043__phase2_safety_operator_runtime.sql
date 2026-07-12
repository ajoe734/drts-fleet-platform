-- V0040 — Phase 2 safety-operator runtime persistence.
--
-- Adds mutable runtime tables for safety-operator shifts, pre-trip checklists,
-- takeover reports, and trip closeouts. Takeover reports enforce
-- client_generated_report_id uniqueness so offline replay remains idempotent.

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_shifts (
  shift_id uuid PRIMARY KEY,
  safety_operator_id varchar(100) NOT NULL,
  sandbox_program_id varchar(100) NOT NULL,
  device_id varchar(200) NOT NULL,
  vehicle_id varchar(100) NULL,
  assignment_id uuid NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  start_location jsonb NULL,
  end_location jsonb NULL,
  notes text NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_shifts_operator
  ON av_sandbox.safety_operator_shifts(safety_operator_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_operator_shifts_device
  ON av_sandbox.safety_operator_shifts(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_pre_trip_checklists (
  checklist_id uuid PRIMARY KEY,
  shift_id uuid NOT NULL,
  assignment_id uuid NULL,
  safety_operator_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  completed_at timestamptz NOT NULL,
  all_passed boolean NOT NULL,
  blocker_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_pre_trip_checklists_shift
  ON av_sandbox.safety_operator_pre_trip_checklists(shift_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_operator_pre_trip_checklists_vehicle
  ON av_sandbox.safety_operator_pre_trip_checklists(vehicle_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_takeover_reports (
  report_id uuid PRIMARY KEY,
  client_generated_report_id varchar(200) NOT NULL UNIQUE,
  safety_operator_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  order_id varchar(100) NULL,
  sandbox_program_id varchar(100) NOT NULL,
  shift_id uuid NULL,
  assignment_id uuid NULL,
  correlation_id varchar(200) NOT NULL,
  trigger text NOT NULL,
  reason_code text NOT NULL,
  disposition text NOT NULL,
  fsd_resumed boolean NOT NULL DEFAULT false,
  bookmark_id varchar(100) NULL,
  incident_id varchar(100) NULL,
  evidence_artifact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  occurred_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_takeover_reports_operator
  ON av_sandbox.safety_operator_takeover_reports(
    safety_operator_id,
    occurred_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_operator_takeover_reports_correlation
  ON av_sandbox.safety_operator_takeover_reports(
    correlation_id,
    occurred_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_operator_takeover_reports_vehicle
  ON av_sandbox.safety_operator_takeover_reports(
    vehicle_id,
    occurred_at DESC
  );

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_trip_closeouts (
  closeout_id uuid PRIMARY KEY,
  assignment_id uuid NULL,
  shift_id uuid NULL,
  safety_operator_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  order_id varchar(100) NULL,
  closeout_status text NOT NULL,
  closeout_at timestamptz NOT NULL,
  takeover_report_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  incident_id varchar(100) NULL,
  evidence_artifact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_trip_closeouts_operator
  ON av_sandbox.safety_operator_trip_closeouts(
    safety_operator_id,
    closeout_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_safety_operator_trip_closeouts_vehicle
  ON av_sandbox.safety_operator_trip_closeouts(vehicle_id, closeout_at DESC);
