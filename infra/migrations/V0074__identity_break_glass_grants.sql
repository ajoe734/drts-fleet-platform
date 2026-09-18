CREATE TABLE IF NOT EXISTS iam.identity_break_glass_grants (
  grant_id varchar(100) PRIMARY KEY,
  requester_principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  approver_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  session_id varchar(100) REFERENCES iam.identity_sessions(session_id),
  grant_status varchar(30) NOT NULL,
  requested_scopes text[] NOT NULL,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  reason_code varchar(100) NOT NULL,
  proof_reference varchar(255) NOT NULL,
  requested_at timestamptz NOT NULL,
  approved_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  closed_by_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  close_reason varchar(100),
  post_use_review_required boolean NOT NULL DEFAULT false,
  post_use_reviewed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  record jsonb NOT NULL,
  CONSTRAINT chk_identity_break_glass_status CHECK (grant_status IN ('requested', 'approved', 'active', 'closed', 'expired', 'revoked')),
  CONSTRAINT chk_identity_break_glass_two_person CHECK (approver_principal_id IS NULL OR approver_principal_id <> requester_principal_id),
  CONSTRAINT chk_identity_break_glass_expiry CHECK (expires_at IS NULL OR activated_at IS NULL OR expires_at <= activated_at + interval '60 minutes')
);

CREATE INDEX IF NOT EXISTS idx_identity_break_glass_expiry
  ON iam.identity_break_glass_grants (grant_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_identity_break_glass_requester
  ON iam.identity_break_glass_grants (requester_principal_id, requested_at DESC);
