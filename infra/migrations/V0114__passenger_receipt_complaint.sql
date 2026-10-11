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

-- One immutable contact choice bound to the original persisted rating.
CREATE TABLE passenger.rating_consents (
  order_id uuid PRIMARY KEY REFERENCES passenger.booking_histories(order_id),
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  rating_id varchar(255) NOT NULL UNIQUE REFERENCES ops.passenger_trip_ratings(rating_id),
  source varchar(32) NOT NULL DEFAULT 'passenger_app' CHECK (source = 'passenger_app'),
  contact_requested boolean NOT NULL,
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  complaint_case_no varchar(100) UNIQUE REFERENCES passenger.complaints(case_no),
  created_at timestamptz NOT NULL,
  CHECK (contact_requested OR complaint_case_no IS NULL)
);

-- No cascades: account soft deletion preserves existing complaint/ride history.
COMMIT;
