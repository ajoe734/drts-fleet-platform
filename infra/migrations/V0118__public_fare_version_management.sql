BEGIN;

-- Numeric tariff authority remains passenger.fare_versions (V0112).
CREATE TABLE passenger.fare_version_management (
  fare_version varchar(100) PRIMARY KEY REFERENCES passenger.fare_versions(version),
  display_name varchar(200) NOT NULL CHECK (btrim(display_name) <> ''),
  public_summary text NOT NULL CHECK (btrim(public_summary) <> ''),
  authority_filing_ref varchar(500),
  filing_evidence_reference varchar(1000),
  filed_at timestamptz,
  filed_by varchar(200),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by varchar(200),
  updated_by varchar(200) NOT NULL,
  updated_at timestamptz NOT NULL,
  retired_reason text,
  CHECK ((authority_filing_ref IS NULL AND filing_evidence_reference IS NULL AND filed_at IS NULL AND filed_by IS NULL)
    OR (authority_filing_ref IS NOT NULL AND filing_evidence_reference IS NOT NULL AND filed_by IS NOT NULL AND btrim(authority_filing_ref) <> '' AND btrim(filing_evidence_reference) <> '' AND filed_at IS NOT NULL AND btrim(filed_by) <> ''))
);

-- A committed logical command can be retried without rewriting later intervals.
CREATE TABLE passenger.fare_version_command_receipts (
  actor_id varchar(200) NOT NULL,
  operation varchar(20) NOT NULL CHECK (operation IN ('create','update','file','schedule','retire')),
  idempotency_key varchar(255) NOT NULL CHECK (btrim(idempotency_key) <> ''),
  fare_version varchar(100) NOT NULL REFERENCES passenger.fare_versions(version),
  payload_hash varchar(64) NOT NULL,
  committed_at timestamptz NOT NULL,
  audit_id uuid NOT NULL,
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

COMMIT;
