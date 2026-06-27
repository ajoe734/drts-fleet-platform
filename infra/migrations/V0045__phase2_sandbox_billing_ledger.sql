-- V0045 — Phase 2 sandbox billing ledger persistence.
--
-- Adds the AV sandbox fulfillment ledger and sandbox billing treatment tables
-- used by owned-mobility trip completion and billing-settlement persistence.
-- These rows are order-scoped operational facts, so ids stay varchar(100) to
-- match the Phase 1 runtime id conventions and avoid UUID-only coupling.

CREATE SCHEMA IF NOT EXISTS av_sandbox;

CREATE TABLE IF NOT EXISTS av_sandbox.fulfillment_segments (
  fulfillment_segment_id varchar(100) PRIMARY KEY,
  booking_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  sandbox_trip_id varchar(100) NULL,
  segment_type text NOT NULL,
  segment_reason text NOT NULL,
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  vehicle_id varchar(100) NULL,
  vin varchar(100) NULL,
  driver_id varchar(100) NULL,
  safety_operator_id varchar(100) NULL,
  source_platform text NULL,
  distance_km double precision NULL,
  duration_seconds integer NULL,
  cost_minor bigint NULL,
  currency varchar(3) NOT NULL DEFAULT 'NTD',
  evidence_reference text NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_segments_order_created
  ON av_sandbox.fulfillment_segments(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fulfillment_segments_booking_created
  ON av_sandbox.fulfillment_segments(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_billing_treatments (
  sandbox_billing_treatment_id varchar(100) PRIMARY KEY,
  booking_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  sandbox_trip_id varchar(100) NULL,
  treatment_type text NOT NULL,
  fallback_cost_absorber text NULL,
  fallback_policy_id varchar(100) NULL,
  policy_resolution text NOT NULL,
  passenger_extra_charge_allowed boolean NOT NULL DEFAULT false,
  passenger_extra_charge_minor bigint NOT NULL DEFAULT 0,
  internal_av_cost_minor bigint NULL,
  internal_human_fallback_cost_minor bigint NULL,
  partner_charge_minor bigint NULL,
  tenant_charge_minor bigint NULL,
  platform_absorbed_minor bigint NULL,
  currency varchar(3) NOT NULL DEFAULT 'NTD',
  treatment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sandbox_billing_treatments_order_created
  ON av_sandbox.sandbox_billing_treatments(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_billing_treatments_booking_created
  ON av_sandbox.sandbox_billing_treatments(booking_id, created_at DESC);
