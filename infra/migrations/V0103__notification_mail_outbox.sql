-- V0103__notification_mail_outbox.sql
-- SR-LAUNCH-SCHEMA-20260913: PostgreSQL storage compatible with the existing
-- MailOutbox.transaction callback contract, providing durable multi-host spooling
-- without reliance on ephemeral local volumes or parallel delivery frameworks.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (SR-LAUNCH-SCHEMA-20260913, V0103 entry); implements consensus-packet.md §B5.
--
-- Invariants:
-- 1. Full compatibility with MailOutbox.transaction(operation) callback contract
--    defined in apps/api/src/modules/notification-delivery/notification-delivery.types.ts.
-- 2. Concurrency serialization: ops.phase1_notification_mail_outbox_lock provides
--    durable mutual exclusion across multi-replica Cloud Run containers during
--    transaction callback execution.
-- 3. Tenant-scoped idempotency: UNIQUE (tenant_id, idempotency_key) ensures that
--    identical requests cannot insert duplicate delivery rows. Mismatched payload_hash
--    triggers notification_idempotency_conflict as required by NotificationDeliveryService.
-- 4. Separation of provider acknowledgement and device/inbox arrival: provider
--    acknowledgement records transport acceptance evidence, never a fabricated claim
--    of end-user inbox receipt.
-- 5. Survives process crashes and restarts without ephemeral volume dependencies,
--    replacing FileMailOutbox with production-grade PostgreSQL storage.

CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_deliveries (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(100) NOT NULL,
  idempotency_key text NOT NULL,
  message_id text NOT NULL,
  payload_hash text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sent', 'failed')
  ),
  recipient_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  next_attempt_at timestamptz,
  lease_attempt_id uuid,
  lease_expires_at timestamptz,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_notification_mail_tenant_key UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_phase1_notification_mail_due
  ON ops.phase1_notification_mail_deliveries (status, next_attempt_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_phase1_notification_mail_tenant
  ON ops.phase1_notification_mail_deliveries (tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_phase1_notification_mail_deliveries ON ops.phase1_notification_mail_deliveries;
CREATE TRIGGER trg_touch_phase1_notification_mail_deliveries
BEFORE UPDATE ON ops.phase1_notification_mail_deliveries
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_outbox_lock (
  lock_key varchar(50) PRIMARY KEY DEFAULT 'mail_outbox_master',
  locked_by text,
  locked_at timestamptz
);

INSERT INTO ops.phase1_notification_mail_outbox_lock (lock_key)
VALUES ('mail_outbox_master')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES ops.phase1_notification_mail_deliveries (delivery_id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  outcome varchar(20) NOT NULL CHECK (
    outcome IN ('started', 'sent', 'failed', 'uncertain')
  ),
  error_code text,
  retryable boolean NOT NULL DEFAULT false,
  acknowledgement jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_notification_mail_attempt_no UNIQUE (delivery_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_phase1_notification_mail_attempts_delivery
  ON ops.phase1_notification_mail_attempts (delivery_id, started_at DESC);
