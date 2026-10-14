-- PAX-RECEIPT-COMPLAINT-20261009: Supervisor-allocated forward migration.
-- Exact allocation: docs/04-uat/passenger-app-20261009/schema-allocation-20261014-token-rating-contact.json.
-- Token subjects remain token subjects; no passenger account/booking is synthesized.
BEGIN;

ALTER TABLE ops.passenger_trip_ratings
  ADD CONSTRAINT passenger_rating_token_subject_key
  UNIQUE (rating_id, order_id, passenger_subject_ref, score);

ALTER TABLE ops.passenger_ride_access_tokens
  ADD CONSTRAINT passenger_ride_token_subject_key
  UNIQUE (token_id, order_id, passenger_subject_ref);

CREATE TABLE ops.passenger_ride_rating_consents (
  order_id varchar(255) NOT NULL REFERENCES ops.phase1_owned_orders(order_id),
  passenger_subject_ref varchar(255) NOT NULL,
  rating_id varchar(255) NOT NULL UNIQUE,
  original_token_id varchar(255) NOT NULL,
  rating_score smallint NOT NULL CHECK (rating_score BETWEEN 1 AND 5),
  source varchar(32) NOT NULL DEFAULT 'passenger_ride_token'
    CHECK (source = 'passenger_ride_token'),
  contact_requested boolean NOT NULL,
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  complaint_case_no varchar(100) UNIQUE REFERENCES crm.phase1_complaint_cases(case_no),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, passenger_subject_ref),
  FOREIGN KEY (rating_id, order_id, passenger_subject_ref, rating_score)
    REFERENCES ops.passenger_trip_ratings(rating_id, order_id, passenger_subject_ref, score),
  FOREIGN KEY (original_token_id, order_id, passenger_subject_ref)
    REFERENCES ops.passenger_ride_access_tokens(token_id, order_id, passenger_subject_ref),
  CHECK ((contact_requested AND rating_score <= 2) = (complaint_case_no IS NOT NULL))
);

-- Existing ratings have no recorded choice: never guess/backfill consent.
-- No cascades or updates to historical account consent/intake records.
COMMIT;
