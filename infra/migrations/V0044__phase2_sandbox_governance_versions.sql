-- V0044 — Phase 2 sandbox-governance versions and reproducible snapshots.
--
-- Adds governance/versioning tables for SandboxExperimentProgram,
-- JurisdictionProfile, ApprovalDocumentVersion, and materialized compliance
-- snapshot evidence. The API currently serves an in-memory execution model;
-- these tables reserve the persistence surface with the same effective-dating
-- and rollback semantics.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS av_sandbox.sandbox_experiment_program_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id varchar(100) NOT NULL,
  version_no integer NOT NULL,
  program_code varchar(100) NOT NULL,
  name text NOT NULL,
  description text NULL,
  jurisdiction_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification_matrix jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_status text NOT NULL,
  authorization_status text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  published_at timestamptz NULL,
  published_by varchar(100) NULL,
  rollback_from_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(100) NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(100) NULL,
  UNIQUE (experiment_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_sandbox_experiment_program_versions_current
  ON av_sandbox.sandbox_experiment_program_versions(experiment_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.jurisdiction_profile_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id varchar(100) NOT NULL,
  version_no integer NOT NULL,
  jurisdiction_code varchar(100) NOT NULL,
  name text NOT NULL,
  regulator_name text NOT NULL,
  approval_lead_time_days integer NULL,
  retention_days integer NULL,
  notification_matrix jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_status text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  published_at timestamptz NULL,
  published_by varchar(100) NULL,
  rollback_from_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(100) NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(100) NULL,
  UNIQUE (jurisdiction_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_profile_versions_current
  ON av_sandbox.jurisdiction_profile_versions(jurisdiction_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.approval_document_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id varchar(100) NOT NULL,
  version_no integer NOT NULL,
  experiment_id varchar(100) NOT NULL,
  jurisdiction_id varchar(100) NOT NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  summary text NULL,
  artifact_file_name text NOT NULL,
  artifact_content_type text NOT NULL,
  artifact_byte_size integer NOT NULL,
  artifact_sha256 varchar(64) NOT NULL,
  artifact_uploaded_at timestamptz NOT NULL,
  artifact_uploaded_by varchar(100) NULL,
  supersedes_version_id uuid NULL,
  lifecycle_status text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  published_at timestamptz NULL,
  published_by varchar(100) NULL,
  rollback_from_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(100) NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(100) NULL,
  UNIQUE (document_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_approval_document_versions_current
  ON av_sandbox.approval_document_versions(document_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.compliance_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id varchar(100) NOT NULL,
  experiment_version_id uuid NULL,
  as_of timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by varchar(100) NULL,
  snapshot_hash_sha256 varchar(64) NOT NULL,
  policy_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorization_status text NULL,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  jurisdictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_documents jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_experiment_as_of
  ON av_sandbox.compliance_snapshots(experiment_id, as_of DESC);
