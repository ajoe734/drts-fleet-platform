-- P5-PAY-RECOVERY-001
-- Durable, idempotent command boundary for repository-owned payment recovery.
-- Provider credentials, card data, payment tokens, and raw provider payloads
-- are intentionally excluded.

CREATE TABLE IF NOT EXISTS billing.multi_taxi_payment_recovery_commands (
  recovery_command_id uuid PRIMARY KEY,
  payment_id varchar(255) NOT NULL
    REFERENCES billing.multi_taxi_passenger_payments(payment_id),
  order_id varchar(255) NOT NULL,
  action text NOT NULL
    CHECK (action IN ('retry_capture', 'begin_manual_recovery')),
  idempotency_key varchar(255) NOT NULL,
  state text NOT NULL
    CHECK (state IN ('processing', 'accepted', 'completed', 'failed')),
  actor_id text NOT NULL,
  request_id text NULL,
  reason text NULL,
  action_receipt jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS multi_taxi_payment_recovery_latest_idx
  ON billing.multi_taxi_payment_recovery_commands (
    payment_id,
    created_at DESC
  );

ALTER TABLE billing.multi_taxi_payment_recovery_commands
  DROP CONSTRAINT IF EXISTS multi_taxi_payment_recovery_receipt_state_chk;

ALTER TABLE billing.multi_taxi_payment_recovery_commands
  ADD CONSTRAINT multi_taxi_payment_recovery_receipt_state_chk
  CHECK (
    (state IN ('accepted', 'completed') AND action_receipt IS NOT NULL)
    OR
    (state IN ('processing', 'failed') AND action_receipt IS NULL)
  );
