-- P5-PAY-OPS-UI-001
-- Provider-owned recovery descriptors remain data-only until a canonical
-- recovery command is approved. Raw payment method tokens stay out of this
-- read model.

ALTER TABLE billing.multi_taxi_passenger_payments
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_actions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE billing.multi_taxi_passenger_payments
  DROP CONSTRAINT IF EXISTS multi_taxi_payment_attempt_count_chk;

ALTER TABLE billing.multi_taxi_passenger_payments
  ADD CONSTRAINT multi_taxi_payment_attempt_count_chk
  CHECK (attempt_count >= 0);

ALTER TABLE billing.multi_taxi_passenger_payments
  DROP CONSTRAINT IF EXISTS multi_taxi_payment_available_actions_array_chk;

ALTER TABLE billing.multi_taxi_passenger_payments
  ADD CONSTRAINT multi_taxi_payment_available_actions_array_chk
  CHECK (jsonb_typeof(available_actions) = 'array');
