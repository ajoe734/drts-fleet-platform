-- 10b_phase2_ddl_decision_packet_addendum.sql
-- Phase 2 Tesla FSD Sandbox - Decision Packet Addendum Tables (S1-S6 response, S5=A)
-- PostgreSQL 16 + PostGIS. Must be applied after 10_phase2_data_model_ddl_draft.sql.
-- Source: phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md §5.2
-- Authority for the 6 decision-packet tables; engineering migrations align to this (CREATE ... IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS av_sandbox;
CREATE SCHEMA IF NOT EXISTS av_evidence;

-- ---------------------------------------------------------------------------
-- Evidence legal holds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS av_evidence.evidence_legal_holds (
  legal_hold_id TEXT PRIMARY KEY,
  hold_scope TEXT NOT NULL CHECK (hold_scope IN ('evidence_object','evidence_freeze','accident_case','sandbox_trip','experiment')),
  subject_id TEXT NOT NULL,
  experiment_id TEXT,
  sandbox_trip_id TEXT,
  accident_case_id TEXT,
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','release_requested','released','rejected')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2_legal_hold_subject ON av_evidence.evidence_legal_holds(hold_scope, subject_id);
CREATE INDEX IF NOT EXISTS idx_p2_legal_hold_status ON av_evidence.evidence_legal_holds(status, created_at DESC);

CREATE TABLE IF NOT EXISTS av_evidence.evidence_legal_hold_release_requests (
  release_request_id TEXT PRIMARY KEY,
  legal_hold_id TEXT NOT NULL REFERENCES av_evidence.evidence_legal_holds(legal_hold_id),
  requested_by TEXT NOT NULL,
  request_reason TEXT NOT NULL,
  first_approver_id TEXT,
  second_approver_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  decision_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_p2_hold_release_status ON av_evidence.evidence_legal_hold_release_requests(status, requested_at DESC);

-- ---------------------------------------------------------------------------
-- Evidence deletion exceptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS av_evidence.evidence_deletion_exceptions (
  deletion_exception_id TEXT PRIMARY KEY,
  exception_scope TEXT NOT NULL CHECK (exception_scope IN ('evidence_object','evidence_freeze','accident_case','sandbox_trip','experiment')),
  subject_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','resolved','expired','cancelled')),
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_p2_deletion_exception_subject ON av_evidence.evidence_deletion_exceptions(exception_scope, subject_id);
CREATE INDEX IF NOT EXISTS idx_p2_deletion_exception_status ON av_evidence.evidence_deletion_exceptions(status, expires_at);

-- ---------------------------------------------------------------------------
-- Fulfillment segmentation: single booking, multiple fulfillment segments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS av_sandbox.fulfillment_segments (
  fulfillment_segment_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sandbox_trip_id TEXT,
  segment_type TEXT NOT NULL CHECK (segment_type IN ('tesla_av','human_taxi','cancelled','non_revenue_recovery')),
  segment_reason TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  vehicle_id TEXT,
  vin TEXT,
  driver_id TEXT,
  safety_operator_id TEXT,
  source_platform TEXT,
  distance_km NUMERIC(12,3),
  duration_seconds INTEGER,
  cost_minor BIGINT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2_fulfillment_booking ON av_sandbox.fulfillment_segments(booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_p2_fulfillment_order ON av_sandbox.fulfillment_segments(order_id, created_at);

-- ---------------------------------------------------------------------------
-- Sandbox billing treatment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_billing_treatments (
  sandbox_billing_treatment_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sandbox_trip_id TEXT,
  treatment_type TEXT NOT NULL CHECK (treatment_type IN ('normal_av','fallback_human','incident_waived','partner_program_adjusted','tenant_contract_adjusted')),
  fallback_cost_absorber TEXT CHECK (fallback_cost_absorber IN ('platform','partner','tenant_contract')),
  fallback_policy_id TEXT,
  policy_resolution TEXT NOT NULL,
  passenger_extra_charge_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  passenger_extra_charge_minor BIGINT NOT NULL DEFAULT 0,
  internal_av_cost_minor BIGINT,
  internal_human_fallback_cost_minor BIGINT,
  partner_charge_minor BIGINT,
  tenant_charge_minor BIGINT,
  platform_absorbed_minor BIGINT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  treatment_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2_billing_treatment_booking ON av_sandbox.sandbox_billing_treatments(booking_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Sandbox fulfillment visibility projection
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_fulfillment_visibility (
  visibility_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sandbox_trip_id TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('passenger','tenant','partner','ops','platform_admin')),
  fulfillment_mode TEXT NOT NULL CHECK (fulfillment_mode IN ('tesla_av','human_fallback','mixed','hidden')),
  status_code TEXT NOT NULL,
  message_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  eta_minutes INTEGER,
  extra_charge_disclosed BOOLEAN NOT NULL DEFAULT FALSE,
  safety_disclosure_policy_id TEXT,
  visibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2_visibility_booking_audience ON av_sandbox.sandbox_fulfillment_visibility(booking_id, audience);
