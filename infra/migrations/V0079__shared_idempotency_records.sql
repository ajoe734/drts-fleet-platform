-- V0079__shared_idempotency_records.sql
-- Phase 1 Shared Idempotency Foundation (CONF-IDEM-001)
-- Provides durable replay and deduplication across order dispatch, finance, CRM, and async tasks.

CREATE TABLE IF NOT EXISTS ops.idempotency_records (
  record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(255) NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  tenant_id varchar(100) NULL,
  actor_id varchar(255) NULL,
  request_path varchar(500) NULL,
  payload_hash varchar(64) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'processing',
  status_code integer NULL,
  response_body jsonb NULL,
  action_receipt jsonb NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  CONSTRAINT chk_idempotency_record_status CHECK (
    status IN ('processing', 'completed', 'failed')
  ),
  CONSTRAINT uq_idempotency_records_scope_key UNIQUE (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_tenant
  ON ops.idempotency_records (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_idempotency_records_created_at
  ON ops.idempotency_records (created_at DESC);
