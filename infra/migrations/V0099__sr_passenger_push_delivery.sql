-- V0099__sr_passenger_push_delivery.sql
-- SR-PUSH-DURABILITY-20260911: durable claim/lease/fence and idempotent
-- provider-receipt storage underneath the existing single-attempt-result
-- ops.consumer_notification_outbox row.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (SR-RECOVERY-CONTRACTS-20260911, V0099 entry); table shape follows that
-- entry's invariants and packages/contracts/src/passenger-push-delivery.ts.
--
-- Deviation from the allocation text: it describes tenant_id columns
-- "copied from ops.consumer_notification_outbox at claim/receipt time",
-- but that table (V0056__multi_taxi_runtime_compliance_closure.sql) and its
-- ConsumerNotificationOutboxRecord contract carry no tenant_id — multi-taxi
-- has no tenant concept today (see multi-taxi.service.ts's masked-call audit
-- log, which records tenantId: null). Fabricating a tenant_id here would be
-- a dummy value standing in for state that does not exist, which the wave's
-- own boundary_invariants.authoritative_model_rule forbids. Both tables
-- below omit tenant_id; a future tenant-aware push pipeline can add it.

CREATE TABLE IF NOT EXISTS ops.phase1_push_delivery_claims (
  -- One live claim row per outbox row (not a history table).
  outbox_id varchar(255) PRIMARY KEY
    REFERENCES ops.consumer_notification_outbox (outbox_id),
  passenger_subject_ref varchar(255) NOT NULL,
  worker_id text NOT NULL,
  claim_state text NOT NULL DEFAULT 'released'
    CHECK (claim_state IN ('claimed', 'released', 'expired')),
  -- Increments on every successful (re)claim. Every later write for this
  -- attempt (release, receipt persistence) must carry the fence_token it
  -- was granted, so a worker whose lease has since been reclaimed writes
  -- with a stale token and affects zero rows instead of clobbering the
  -- worker that reclaimed the row.
  fence_token integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_push_delivery_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id varchar(255) NOT NULL
    REFERENCES ops.consumer_notification_outbox (outbox_id),
  passenger_subject_ref varchar(255) NOT NULL,
  -- Server-derived from (outbox_id, fence_token), never client-suppliable,
  -- so a retried write for the same claimed attempt cannot insert a second
  -- receipt.
  dedupe_key text NOT NULL,
  fence_token integer NOT NULL,
  provider_name text NULL,
  provider_ack_state text NOT NULL
    CHECK (provider_ack_state IN (
      'provider_acknowledged', 'provider_rejected', 'provider_not_configured'
    )),
  provider_message_ref text NULL,
  -- A provider ack is not proof of on-device delivery; no application code
  -- path may set this to 'delivered' as a side effect of
  -- provider_ack_state = 'provider_acknowledged'. It stays 'unknown' until
  -- an independent delivery signal is observed (out of this task's scope).
  device_delivery_state text NOT NULL DEFAULT 'unknown'
    CHECK (device_delivery_state IN ('unknown', 'delivered', 'delivery_failed')),
  acked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_delivery_receipts_dedupe_key UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_receipts_outbox_id
  ON ops.phase1_push_delivery_receipts (outbox_id);
