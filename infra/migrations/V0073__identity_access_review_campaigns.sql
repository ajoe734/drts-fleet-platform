-- Migration: V0073__identity_access_review_campaigns.sql
-- Privileged access review campaigns, items, decisions, and immutable evidence tables.

CREATE TABLE IF NOT EXISTS iam.access_review_campaigns (
  campaign_id varchar(100) PRIMARY KEY,
  title varchar(255) NOT NULL,
  realm varchar(50) NOT NULL,
  tenant_id varchar(100),
  target_role_family varchar(100),
  reviewer_principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  status varchar(50) NOT NULL DEFAULT 'active',
  deadline_at timestamptz NOT NULL,
  overdue_policy varchar(50) NOT NULL DEFAULT 'alert_only',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  record jsonb NOT NULL,
  CONSTRAINT chk_iam_access_review_campaigns_realm CHECK (
    realm IN ('platform', 'tenant', 'partner', 'operations')
  ),
  CONSTRAINT chk_iam_access_review_campaigns_status CHECK (
    status IN ('draft', 'active', 'completed', 'overdue', 'cancelled')
  ),
  CONSTRAINT chk_iam_access_review_campaigns_overdue_policy CHECK (
    overdue_policy IN ('alert_only', 'auto_revoke')
  )
);

CREATE TABLE IF NOT EXISTS iam.access_review_items (
  review_id varchar(100) PRIMARY KEY,
  campaign_id varchar(100) NOT NULL REFERENCES iam.access_review_campaigns(campaign_id) ON DELETE CASCADE,
  target_principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  membership_id varchar(100) REFERENCES iam.identity_memberships(membership_id),
  role_binding_id varchar(100) REFERENCES iam.identity_role_bindings(role_binding_id),
  tenant_id varchar(100),
  role_code varchar(100) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'pending',
  decision varchar(50),
  reduced_role_code varchar(100),
  decision_by_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  decided_at timestamptz,
  remediated_at timestamptz,
  session_revoked boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  record jsonb NOT NULL,
  CONSTRAINT chk_iam_access_review_items_status CHECK (
    status IN ('pending', 'certified', 'reduced', 'removed', 'overdue')
  ),
  CONSTRAINT chk_iam_access_review_items_decision CHECK (
    decision IS NULL OR decision IN ('certify', 'reduce', 'remove', 'revoke', 'defer')
  )
);

CREATE TABLE IF NOT EXISTS iam.access_review_evidence (
  evidence_id varchar(100) PRIMARY KEY,
  campaign_id varchar(100) NOT NULL,
  review_id varchar(100) NOT NULL,
  actor_principal_id varchar(100) NOT NULL,
  target_principal_id varchar(100) NOT NULL,
  tenant_id varchar(100),
  decision varchar(50) NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  session_revoked boolean NOT NULL DEFAULT false,
  reason_code varchar(100) NOT NULL,
  reason_text text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_iam_access_review_campaigns_tenant ON iam.access_review_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_iam_access_review_campaigns_deadline ON iam.access_review_campaigns(status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_iam_access_review_items_campaign ON iam.access_review_items(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_iam_access_review_items_principal ON iam.access_review_items(target_principal_id);
CREATE INDEX IF NOT EXISTS idx_iam_access_review_evidence_campaign ON iam.access_review_evidence(campaign_id);
CREATE INDEX IF NOT EXISTS idx_iam_access_review_evidence_tenant ON iam.access_review_evidence(tenant_id);

CREATE OR REPLACE FUNCTION iam.raise_access_review_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'iam.access_review_evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_access_review_evidence_append_only
  ON iam.access_review_evidence;

CREATE TRIGGER trg_access_review_evidence_append_only
BEFORE UPDATE OR DELETE ON iam.access_review_evidence
FOR EACH ROW
EXECUTE FUNCTION iam.raise_access_review_evidence_append_only();

REVOKE UPDATE, DELETE ON iam.access_review_evidence FROM PUBLIC;
