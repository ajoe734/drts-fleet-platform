-- PAX-PAYMENT-CORE-20261009; formal passenger_app_allocations V0115.
-- Billing V0056/V0060/V0084 remains the payment-status authority.
BEGIN;

CREATE TABLE passenger.psp_tokens (
  payment_method_id uuid PRIMARY KEY,
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  provider text NOT NULL,
  token_envelope jsonb,
  last4 varchar(4) NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  card_type varchar(40) NOT NULL,
  expiry_month varchar(2) NOT NULL CHECK (expiry_month ~ '^(0[1-9]|1[0-2])$'),
  expiry_year varchar(4) NOT NULL CHECK (expiry_year ~ '^[0-9]{4}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK ((status = 'active' AND token_envelope IS NOT NULL AND removed_at IS NULL)
      OR (status = 'removed' AND token_envelope IS NULL AND removed_at IS NOT NULL AND NOT is_default)),
  CHECK (token_envelope IS NULL OR (jsonb_typeof(token_envelope) = 'object'
    AND token_envelope ->> 'version' = '1'
    AND token_envelope ?& ARRAY['keyId', 'nonce', 'ciphertext', 'tag'])),
  UNIQUE (payment_method_id, drts_passenger_id)
);
CREATE INDEX passenger_psp_tokens_account_idx ON passenger.psp_tokens(drts_passenger_id);
CREATE UNIQUE INDEX passenger_psp_tokens_one_default_idx
  ON passenger.psp_tokens(drts_passenger_id) WHERE status = 'active' AND is_default;

-- A bind claim is COMMITTED before contacting PSP; a DB failure after token
-- exchange cannot let another account claim the same one-use credential.
-- entity_id is the method ID reserved before exchange, not a plaintext token.
CREATE TABLE passenger.payment_idempotency_keys (
  idempotency_key text PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('bind', 'capture', 'refund')),
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  entity_id uuid NOT NULL,
  credential_digest varchar(64),
  outcome text NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'completed', 'action_required', 'failed', 'unknown')),
  error_code text CHECK (error_code IN ('card_declined', 'invalid_credential', 'unavailable', 'invalid_method')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((operation = 'bind' AND credential_digest IS NOT NULL AND credential_digest ~ '^[0-9a-f]{64}$')
      OR (operation <> 'bind' AND credential_digest IS NULL))
);
CREATE UNIQUE INDEX passenger_bind_credential_idx
  ON passenger.payment_idempotency_keys(credential_digest) WHERE operation = 'bind';

-- Durable operation state is committed before contacting the PSP. A crashed
-- capture resumes with readback of the SAME order key, never another capture.
CREATE TABLE passenger.payment_charge_records (
  order_id uuid PRIMARY KEY REFERENCES passenger.booking_histories(order_id),
  payment_id varchar(255) NOT NULL UNIQUE REFERENCES billing.multi_taxi_passenger_payments(payment_id),
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  payment_method_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE REFERENCES passenger.payment_idempotency_keys(idempotency_key),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency = 'TWD'),
  status text NOT NULL CHECK (status IN ('not_selected', 'authorized', 'captured', 'failed', 'refunded', 'manual_recovery')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  readback_count integer NOT NULL DEFAULT 0 CHECK (readback_count >= 0),
  next_operation text CHECK (next_operation IN ('capture', 'readback')),
  operation_id uuid,
  provider_capture_ref text,
  provider_refund_ref text,
  -- One full Ops refund per order. Unknown requests resume by readback only;
  -- capture/billing remain captured until a definitive successful refund.
  refund_idempotency_key text UNIQUE REFERENCES passenger.payment_idempotency_keys(idempotency_key),
  refund_reason varchar(500),
  refund_actor_id text,
  refund_status text CHECK (refund_status IN ('unknown', 'completed', 'failed')),
  refund_operation_id uuid,
  last_error_code text CHECK (last_error_code IN ('card_declined', 'unavailable', 'invalid_method', 'unknown')),
  retry_at timestamptz,
  completed_at timestamptz NOT NULL,
  recovery_notice_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (payment_method_id, drts_passenger_id)
    REFERENCES passenger.psp_tokens(payment_method_id, drts_passenger_id),
  CHECK ((refund_idempotency_key IS NULL AND refund_reason IS NULL AND refund_actor_id IS NULL
          AND refund_status IS NULL AND refund_operation_id IS NULL AND provider_refund_ref IS NULL)
      OR (refund_idempotency_key IS NOT NULL AND refund_reason IS NOT NULL AND refund_actor_id IS NOT NULL
          AND refund_status IS NOT NULL AND status IN ('captured','refunded')
          AND provider_capture_ref IS NOT NULL)),
  CHECK (refund_status IS DISTINCT FROM 'completed' OR
         (status='refunded' AND provider_refund_ref IS NOT NULL AND refund_operation_id IS NULL)),
  CHECK (refund_operation_id IS NULL OR refund_status='unknown')
);
CREATE INDEX passenger_charge_retry_idx ON passenger.payment_charge_records(retry_at)
  WHERE status = 'failed';

COMMIT;
