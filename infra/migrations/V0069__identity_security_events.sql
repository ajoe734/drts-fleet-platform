CREATE TABLE IF NOT EXISTS admin.security_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type varchar(150) NOT NULL,
  event_family varchar(50) NOT NULL,
  outcome varchar(30) NOT NULL,
  severity varchar(20) NOT NULL,
  actor_id varchar(255),
  actor_type varchar(50) NOT NULL,
  subject_id_hash varchar(255),
  realm varchar(50) NOT NULL,
  tenant_id varchar(255),
  partner_id varchar(255),
  target_type varchar(100),
  target_id varchar(255),
  session_id varchar(255),
  token_id_hash varchar(255),
  auth_methods text[] NOT NULL DEFAULT '{}',
  source_ip_prefix varchar(64),
  user_agent_hash varchar(255),
  request_id varchar(100),
  trace_id varchar(100),
  reason_code varchar(100),
  approval_id varchar(255),
  policy_version varchar(120),
  before_summary jsonb,
  after_summary jsonb,
  masked_context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at
  ON admin.security_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_time
  ON admin.security_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_time
  ON admin.security_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_actor_time
  ON admin.security_events (actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_request_id
  ON admin.security_events (request_id);

CREATE OR REPLACE FUNCTION admin.raise_security_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin.security_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_security_events_append_only
  ON admin.security_events;

CREATE TRIGGER trg_security_events_append_only
BEFORE UPDATE OR DELETE ON admin.security_events
FOR EACH ROW
EXECUTE FUNCTION admin.raise_security_events_append_only();

REVOKE UPDATE, DELETE ON admin.security_events FROM PUBLIC;
