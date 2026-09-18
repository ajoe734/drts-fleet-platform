CREATE TABLE IF NOT EXISTS iam.privileged_role_approval_requests (
  request_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100),
  realm varchar(50) NOT NULL,
  target_user_id varchar(100) NOT NULL,
  target_membership_id varchar(100),
  target_email varchar(320),
  requested_role_code varchar(100) NOT NULL,
  requester_principal_id varchar(100) NOT NULL,
  requester_actor_type varchar(50) NOT NULL,
  reason text NOT NULL,
  status varchar(50) NOT NULL,
  approver_principal_id varchar(100),
  approval_decision varchar(50),
  decided_at timestamptz,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_privileged_role_approval_requests_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'removed')
  )
);

CREATE TABLE IF NOT EXISTS iam.privileged_role_grants (
  grant_id varchar(100) PRIMARY KEY,
  request_id varchar(100) REFERENCES iam.privileged_role_approval_requests(request_id),
  tenant_id varchar(100),
  realm varchar(50) NOT NULL,
  target_user_id varchar(100) NOT NULL,
  target_membership_id varchar(100),
  role_code varchar(100) NOT NULL,
  granted_by_principal_id varchar(100),
  approval_id varchar(100),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_privileged_role_grants_status CHECK (
    status IN ('pending_activation', 'active', 'expired', 'removed')
  )
);

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_tenant
  ON iam.privileged_role_approval_requests(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_privileged_role_grants_tenant
  ON iam.privileged_role_grants(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_privileged_role_grants_user
  ON iam.privileged_role_grants(target_user_id, status);
