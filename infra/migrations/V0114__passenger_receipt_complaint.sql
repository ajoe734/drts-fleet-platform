-- PAX-RECEIPT-COMPLAINT-20261009: allocated V0114.
-- Intake metadata only. The authoritative case and description stay in CRM.
BEGIN;

CREATE TABLE passenger.complaints (
  case_no varchar(100) PRIMARY KEY REFERENCES crm.phase1_complaint_cases(case_no),
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  order_id uuid NOT NULL REFERENCES passenger.booking_histories(order_id),
  source varchar(32) NOT NULL DEFAULT 'passenger_app' CHECK (source = 'passenger_app'),
  category varchar(16) NOT NULL CHECK (category IN ('service', 'fare', 'lost_item', 'other')),
  contact_consent boolean NOT NULL,
  idempotency_key_hash varchar(64) NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  UNIQUE (drts_passenger_id, idempotency_key_hash)
);

CREATE INDEX passenger_complaints_order_idx ON passenger.complaints(order_id);

-- No cascades: account soft deletion preserves existing complaint/ride history.
COMMIT;
