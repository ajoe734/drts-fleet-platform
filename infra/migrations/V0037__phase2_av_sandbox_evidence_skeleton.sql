-- V0037 — Phase 2 skeleton: AV sandbox governance + on-board evidence custody.
--
-- Source of truth:
--   docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md
--     Family 3 — AV / ODD / Tesla / ROC Live-Board Extensions (PRD §16)
--   phase2-tesla-fsd-sandbox-202606 phase SD §3 (data model draft)
--
-- Skeleton-only migration: it provisions the schemas/tables the downstream
-- Phase 2 execution waves (Tesla integration, sandbox dispatch gate, safety
-- operator / ROC, vehicle evidence, accident investigation, regulatory
-- reporting) persist into. No data backfill or service logic is included.
--
-- Naming / ownership alignment notes (mirrors the Phase 1 conventions):
--   * Two new schemas are introduced and kept disjoint from Phase 1 ownership:
--       - av_sandbox  : autonomy telemetry, command bridge, dispatch governance
--       - av_evidence : chain-of-custody evidence, accident cases, reg filings
--   * Subject ids (vehicle_id / driver_id / order_id) are varchar(100) to match
--     the Phase 1 runtime-snapshot id convention adopted in V0036, not UUID FKs.
--   * Every externally-sourced row carries source_* provenance columns that
--     mirror the contracts Phase2SourceMetadata shape.
-- All statements are idempotent so re-application is a no-op.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS av_sandbox;
CREATE SCHEMA IF NOT EXISTS av_evidence;

-- §3.1 Provider capability requirements -----------------------------------

CREATE TABLE IF NOT EXISTS av_sandbox.provider_capability_requirements (
  requirement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_program_id varchar(100) NOT NULL,
  capability text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  min_schema_version text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sandbox_program_id, capability)
);

-- §3.2 Remote command receipts (Tesla command bridge) ---------------------

CREATE TABLE IF NOT EXISTS av_sandbox.command_receipts (
  command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key varchar(200) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  command_type text NOT NULL,
  status text NOT NULL,
  issued_by varchar(100) NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz NULL,
  provider_ref varchar(200) NULL,
  failure_reason_code text NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0',

  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_command_receipts_vehicle
  ON av_sandbox.command_receipts(vehicle_id, issued_at DESC);

-- §3.3 Sandbox dispatch decisions -----------------------------------------

CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_dispatch_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar(100) NOT NULL,
  dispatch_job_id varchar(100) NULL,
  vehicle_id varchar(100) NOT NULL,
  sandbox_program_id varchar(100) NOT NULL,

  decision text NOT NULL,
  odd_in_bounds boolean NOT NULL,
  hard_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  soft_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_safety_operator_id varchar(100) NULL,

  policy_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_dispatch_decisions_order
  ON av_sandbox.sandbox_dispatch_decisions(order_id, evaluated_at DESC);

-- §3.4 Tesla regulatory telemetry -----------------------------------------

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_regulatory_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NOT NULL,
  external_vehicle_ref varchar(200) NULL,
  event_type text NOT NULL,

  occurred_at timestamptz NOT NULL,
  location_lat double precision NULL,
  location_lng double precision NULL,
  speed_mps double precision NULL,
  heading_deg double precision NULL,

  disengagement_cause text NULL,
  provider_reason_code text NULL,

  safety_operator_id varchar(100) NULL,
  roc_operator_id varchar(100) NULL,
  odd_zone_id varchar(100) NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_tesla_regulatory_events_vehicle
  ON av_sandbox.tesla_regulatory_events(vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tesla_regulatory_events_type
  ON av_sandbox.tesla_regulatory_events(event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_vehicle_state_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NOT NULL,
  external_vehicle_ref varchar(200) NOT NULL,
  captured_at timestamptz NOT NULL,

  location_lat double precision NULL,
  location_lng double precision NULL,
  speed_mps double precision NULL,
  heading_deg double precision NULL,
  shift_state text NULL,
  autonomy_state text NOT NULL DEFAULT 'unknown',

  battery_level_pct double precision NULL,
  battery_range_km double precision NULL,
  charging boolean NULL,
  online boolean NOT NULL DEFAULT false,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_tesla_vehicle_state_snapshots_vehicle
  ON av_sandbox.tesla_vehicle_state_snapshots(vehicle_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_public_telemetry_samples (
  sample_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_vehicle_ref varchar(200) NOT NULL,
  captured_at timestamptz NOT NULL,
  location_lat double precision NULL,
  location_lng double precision NULL,
  battery_level_pct double precision NULL,
  online boolean NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_tesla_public_telemetry_samples_ref
  ON av_sandbox.tesla_public_telemetry_samples(external_vehicle_ref, captured_at DESC);

-- §3.5 Safety operator & ROC operations -----------------------------------

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safety_operator_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  order_id varchar(100) NULL,
  status text NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz NULL,
  sandbox_program_id varchar(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_assignments_vehicle
  ON av_sandbox.safety_operator_assignments(vehicle_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.roc_interventions (
  intervention_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roc_operator_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  order_id varchar(100) NULL,
  intervention_type text NOT NULL,
  triggered_by_event_id uuid NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  outcome_note text NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_roc_interventions_vehicle
  ON av_sandbox.roc_interventions(vehicle_id, started_at DESC);

-- §3.6 Vehicle evidence custody -------------------------------------------

CREATE TABLE IF NOT EXISTS av_evidence.evidence_manifests (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NOT NULL,
  case_id varchar(100) NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  custody_state text NOT NULL DEFAULT 'captured',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_manifests_vehicle
  ON av_evidence.evidence_manifests(vehicle_id, window_start DESC);

CREATE TABLE IF NOT EXISTS av_evidence.evidence_manifest_items (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES av_evidence.evidence_manifests(manifest_id),
  artifact_type text NOT NULL,

  object_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,

  captured_at timestamptz NOT NULL,
  custody_state text NOT NULL DEFAULT 'captured',

  vehicle_id varchar(100) NULL,
  case_id varchar(100) NULL,
  retention_until timestamptz NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_evidence_manifest_items_manifest
  ON av_evidence.evidence_manifest_items(manifest_id);

-- §3.7 Accident investigation ---------------------------------------------

CREATE TABLE IF NOT EXISTS av_evidence.accident_cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NOT NULL,
  order_id varchar(100) NULL,
  triggering_event_id uuid NULL,

  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL,

  occurred_at timestamptz NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  reported_by varchar(100) NOT NULL,

  evidence_manifest_id uuid NULL REFERENCES av_evidence.evidence_manifests(manifest_id),
  regulatory_report_id uuid NULL,

  summary text NULL,
  closed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_accident_cases_vehicle
  ON av_evidence.accident_cases(vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_accident_cases_status
  ON av_evidence.accident_cases(status, occurred_at DESC);

-- §3.8 Regulatory reporting -----------------------------------------------

CREATE TABLE IF NOT EXISTS av_evidence.regulatory_report_filings (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',

  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  jurisdiction text NOT NULL,

  case_id uuid NULL REFERENCES av_evidence.accident_cases(case_id),
  evidence_manifest_id uuid NULL REFERENCES av_evidence.evidence_manifests(manifest_id),

  generated_at timestamptz NULL,
  submitted_at timestamptz NULL,
  submitted_by varchar(100) NULL,
  acknowledgement_ref varchar(200) NULL,

  artifact_object_key text NULL,
  artifact_checksum_sha256 varchar(64) NULL
);

CREATE INDEX IF NOT EXISTS idx_regulatory_report_filings_type
  ON av_evidence.regulatory_report_filings(report_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_report_filings_status
  ON av_evidence.regulatory_report_filings(status, period_start DESC);
