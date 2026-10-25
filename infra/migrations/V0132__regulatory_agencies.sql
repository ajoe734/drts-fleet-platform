-- BUREAU-R13-AGENCY-READONLY-PORTAL-20261024
-- Regulatory agency master record for the agency read-only portal
-- (docs/02-architecture/bureau-agency-readonly-20261024.md §2.3).
--
-- Agencies are created by a platform admin; this migration deliberately
-- seeds no agency names or codes (open decision D1, GCP-TOS-REMEDIATION-20260907).
-- Agency memberships, role bindings and invitations reuse the canonical
-- iam.identity_* tables (realm = 'agency', scope_ref = 'agency:<agency_id>').

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.regulatory_agencies (
  agency_id varchar(100) PRIMARY KEY,
  agency_code varchar(100) NOT NULL,
  display_name varchar(255) NOT NULL,
  status varchar(20) NOT NULL,
  created_by_principal_id varchar(100),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_regulatory_agencies_code UNIQUE (agency_code),
  CONSTRAINT chk_regulatory_agencies_status CHECK (
    status IN ('active', 'suspended', 'retired')
  ),
  CONSTRAINT chk_regulatory_agencies_code_format CHECK (
    agency_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'
  ),
  CONSTRAINT chk_regulatory_agencies_display_name CHECK (
    length(btrim(display_name)) > 0
  ),
  CONSTRAINT chk_regulatory_agencies_record_object CHECK (
    jsonb_typeof(record) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_regulatory_agencies_status
  ON core.regulatory_agencies (status, updated_at DESC);
