CREATE TABLE IF NOT EXISTS core.phase1_tenant_approval_requests (
  approval_request_id varchar(150) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  booking_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  evaluation_id varchar(150) NOT NULL,
  status varchar(50) NOT NULL,
  timeout_at timestamptz NOT NULL,
  escalated_at timestamptz,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS core.phase1_tenant_approval_decisions (
  decision_id varchar(150) PRIMARY KEY,
  approval_request_id varchar(150) NOT NULL,
  actor_user_id varchar(100) NOT NULL,
  decision varchar(50) NOT NULL,
  reason_code varchar(100),
  decided_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_approval_requests_lookup
  ON core.phase1_tenant_approval_requests(
    tenant_id,
    status,
    timeout_at,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_approval_requests_booking
  ON core.phase1_tenant_approval_requests(
    tenant_id,
    booking_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_approval_requests_order
  ON core.phase1_tenant_approval_requests(
    tenant_id,
    order_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_approval_decisions_request
  ON core.phase1_tenant_approval_decisions(
    approval_request_id,
    decided_at DESC
  );
