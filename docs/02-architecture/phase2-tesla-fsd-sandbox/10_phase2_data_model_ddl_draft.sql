-- Phase 2 Tesla FSD Sandbox Operations - DDL Draft
-- PostgreSQL 16 + PostGIS. Review naming/ownership with existing Phase 1 schema.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS av_sandbox;
CREATE SCHEMA IF NOT EXISTS av_evidence;

CREATE TABLE IF NOT EXISTS av_sandbox.experiments (
  experiment_id TEXT PRIMARY KEY,
  program_name TEXT NOT NULL,
  applicant_organization TEXT NOT NULL,
  operating_entity TEXT NOT NULL,
  regulator_authority TEXT NOT NULL,
  local_authority TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','active','suspended','expired','closed')),
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,
  passenger_service_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  safety_operator_required BOOLEAN NOT NULL DEFAULT TRUE,
  roc_required BOOLEAN NOT NULL DEFAULT TRUE,
  maximum_vehicles INTEGER,
  maximum_trips_per_day INTEGER,
  maximum_distance_km_per_day NUMERIC(12,3),
  approval_document_version_id TEXT,
  reporting_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  suspension_resume_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.jurisdiction_profiles (
  jurisdiction_profile_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  version INTEGER NOT NULL,
  contacts JSONB NOT NULL,
  notification_matrix JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, version)
);

CREATE TABLE IF NOT EXISTS av_sandbox.approved_operating_areas (
  operating_area_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  approval_document_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_av_area_geom ON av_sandbox.approved_operating_areas USING GIST (geometry);

CREATE TABLE IF NOT EXISTS av_sandbox.approved_routes (
  route_version_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  route_code TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  geometry geometry(MultiLineString, 4326) NOT NULL,
  allowed_pickup_dropoff JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule_policy JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, route_code, version)
);
CREATE INDEX IF NOT EXISTS idx_av_route_geom ON av_sandbox.approved_routes USING GIST (geometry);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_vehicle_bindings (
  binding_id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  vin TEXT NOT NULL UNIQUE,
  provider_vehicle_id TEXT,
  integration_id TEXT NOT NULL,
  virtual_key_status TEXT NOT NULL,
  telemetry_status TEXT NOT NULL,
  regulatory_feed_status TEXT NOT NULL,
  evidence_recorder_status TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','suspended','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_capability_profiles (
  capability_profile_id TEXT PRIMARY KEY,
  vin TEXT NOT NULL REFERENCES av_sandbox.tesla_vehicle_bindings(vin),
  schema_version TEXT NOT NULL,
  firmware_version TEXT,
  hardware_generation TEXT,
  capabilities JSONB NOT NULL,
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessed_at TIMESTAMPTZ NOT NULL,
  raw_provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.vehicle_enrollments (
  enrollment_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  vehicle_id TEXT NOT NULL,
  vin TEXT NOT NULL REFERENCES av_sandbox.tesla_vehicle_bindings(vin),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','suspended','retired')),
  required_capabilities JSONB NOT NULL,
  insurance_reference TEXT,
  permit_reference TEXT,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_qualifications (
  qualification_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','suspended','expired')),
  qualification_data JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_trips (
  sandbox_trip_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES av_sandbox.experiments(experiment_id),
  booking_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  trip_id TEXT,
  vehicle_id TEXT NOT NULL,
  vin TEXT NOT NULL,
  safety_operator_id TEXT NOT NULL,
  route_version_id TEXT,
  jurisdiction_snapshot JSONB NOT NULL,
  compliance_snapshot JSONB NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.dispatch_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  sandbox_trip_id TEXT,
  booking_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  safety_operator_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_codes JSONB NOT NULL,
  snapshot JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL,
  evaluator_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_regulatory_raw_events (
  raw_event_id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL,
  provider_code TEXT NOT NULL DEFAULT 'tesla',
  vin TEXT NOT NULL,
  provider_session_id TEXT,
  sequence_number BIGINT,
  schema_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  headers JSONB NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL,
  quarantine_reason TEXT,
  UNIQUE (provider_code, provider_event_id)
);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_autonomy_sessions (
  provider_session_id TEXT PRIMARY KEY,
  vin TEXT NOT NULL,
  sandbox_trip_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  session_summary JSONB,
  data_completeness TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_autonomy_transition_events (
  canonical_event_id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  provider_session_id TEXT,
  vin TEXT NOT NULL,
  sandbox_trip_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  sequence_number BIGINT,
  event_type TEXT NOT NULL,
  state_before TEXT,
  state_after TEXT,
  trigger_source TEXT,
  provider_reason_code TEXT,
  location geometry(Point, 4326),
  vehicle_speed_kph NUMERIC(8,3),
  schema_version TEXT NOT NULL,
  source_confidence TEXT NOT NULL,
  raw_event_id TEXT NOT NULL REFERENCES av_sandbox.tesla_regulatory_raw_events(raw_event_id)
);
CREATE INDEX IF NOT EXISTS idx_av_transition_time ON av_sandbox.tesla_autonomy_transition_events(vin, occurred_at);

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_takeover_reports (
  report_id TEXT PRIMARY KEY,
  client_generated_report_id TEXT NOT NULL UNIQUE,
  takeover_correlation_id TEXT NOT NULL,
  sandbox_trip_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  vin TEXT NOT NULL,
  safety_operator_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL,
  location geometry(Point, 4326),
  trigger_source TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  description TEXT,
  post_takeover_disposition TEXT NOT NULL,
  fsd_resumed_at TIMESTAMPTZ,
  incident_id TEXT,
  evidence_manifest_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.roc_takeover_responses (
  response_id TEXT PRIMARY KEY,
  takeover_correlation_id TEXT NOT NULL,
  alert_id TEXT,
  roc_operator_id TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  actions JSONB NOT NULL,
  incident_id TEXT,
  fallback_assignment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.evidence_discrepancy_cases (
  discrepancy_id TEXT PRIMARY KEY,
  takeover_correlation_id TEXT,
  sandbox_trip_id TEXT,
  status TEXT NOT NULL,
  discrepancy_type TEXT NOT NULL,
  source_records JSONB NOT NULL,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS av_evidence.evidence_freezes (
  freeze_id TEXT PRIMARY KEY,
  accident_case_id TEXT,
  sandbox_trip_id TEXT,
  trigger_type TEXT NOT NULL,
  trigger_id TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','collecting','sealed','partial','failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sealed_at TIMESTAMPTZ,
  UNIQUE (trigger_type, trigger_id)
);

CREATE TABLE IF NOT EXISTS av_evidence.evidence_objects (
  evidence_id TEXT PRIMARY KEY,
  freeze_id TEXT REFERENCES av_evidence.evidence_freezes(freeze_id),
  source_type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_record_id TEXT,
  vin TEXT,
  device_id TEXT,
  captured_from TIMESTAMPTZ,
  captured_to TIMESTAMPTZ,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT NOT NULL,
  provider_signature TEXT,
  storage_uri TEXT NOT NULL,
  object_generation TEXT,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_evidence.evidence_access_logs (
  access_log_id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES av_evidence.evidence_objects(evidence_id),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  case_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.accident_cases (
  accident_case_id TEXT PRIMARY KEY,
  sandbox_trip_id TEXT NOT NULL,
  incident_id TEXT,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  jurisdiction_snapshot JSONB NOT NULL,
  initial_facts JSONB NOT NULL,
  evidence_freeze_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.regulatory_notifications (
  notification_id TEXT PRIMARY KEY,
  accident_case_id TEXT,
  experiment_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  recipient JSONB NOT NULL,
  due_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  artifact_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS av_sandbox.resume_authorizations (
  authorization_id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  accident_case_id TEXT,
  authority_reference TEXT,
  status TEXT NOT NULL,
  conditions JSONB NOT NULL,
  issued_at TIMESTAMPTZ,
  effective_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
