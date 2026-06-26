-- V0038 — Tesla regulatory capability profiles + reason-code dictionary store.
--
-- Source of truth:
--   phase1_prd_detailed_v1.md §16.1 (`vehicle.capability_profile`)
--   packages/contracts/src/phase2-tesla-fsd-sandbox.ts
--
-- This migration promotes the Phase 2 Tesla capability profile and
-- reason-code dictionary into durable store surfaces on top of the V0037
-- sandbox skeleton. The dictionary preserves provider-origin reason codes
-- without reclassifying them into responsibility or liability categories.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_capability_profiles (
  profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id varchar(100) NULL,
  vin varchar(32) NOT NULL,
  external_vehicle_ref varchar(200) NOT NULL,
  provider_code varchar(100) NOT NULL,
  provider_schema_version text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  passenger_service_status text NOT NULL,
  passenger_service_reason_code text NULL,
  reason_code_dictionary_version text NOT NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0',

  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (vin)
);

CREATE INDEX IF NOT EXISTS idx_tesla_capability_profiles_vehicle
  ON av_sandbox.tesla_capability_profiles(vehicle_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_reason_code_dictionary_versions (
  dictionary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code varchar(100) NOT NULL,
  dictionary_version text NOT NULL,
  effective_from timestamptz NOT NULL,
  published_at timestamptz NOT NULL,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0',

  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider_code, dictionary_version)
);

CREATE INDEX IF NOT EXISTS idx_tesla_reason_code_dictionary_versions_provider
  ON av_sandbox.tesla_reason_code_dictionary_versions(provider_code, published_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_reason_code_dictionary_entries (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dictionary_id uuid NOT NULL REFERENCES av_sandbox.tesla_reason_code_dictionary_versions(dictionary_id) ON DELETE CASCADE,
  provider_code varchar(100) NOT NULL,
  dictionary_version text NOT NULL,
  reason_code text NOT NULL,
  display_label text NULL,
  description text NULL,
  related_event_types jsonb NOT NULL DEFAULT '[]'::jsonb,

  source_system text NOT NULL,
  source_ref varchar(200) NULL,
  source_ingested_at timestamptz NOT NULL DEFAULT now(),
  source_recorded_at timestamptz NULL,
  source_signature_ref varchar(200) NULL,
  source_schema_version text NOT NULL DEFAULT '1.0',

  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (dictionary_id, reason_code)
);

CREATE INDEX IF NOT EXISTS idx_tesla_reason_code_dictionary_entries_code
  ON av_sandbox.tesla_reason_code_dictionary_entries(provider_code, reason_code);
