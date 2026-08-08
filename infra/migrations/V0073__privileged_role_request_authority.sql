CREATE TABLE IF NOT EXISTS iam.privileged_role_requests (
  request_id varchar(100) PRIMARY KEY,
  membership_id varchar(100) NOT NULL REFERENCES iam.identity_memberships(membership_id) ON DELETE CASCADE,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  realm varchar(50) NOT NULL,
  role_code varchar(100) NOT NULL,
  request_status varchar(50) NOT NULL,
  version integer NOT NULL,
  activate_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_privileged_role_request_status CHECK (
    request_status IN ('pending_approval', 'approved', 'active', 'rejected', 'expired', 'removed')
  ),
  CONSTRAINT chk_privileged_role_request_version CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_membership
  ON iam.privileged_role_requests(membership_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_status
  ON iam.privileged_role_requests(request_status, updated_at DESC);
