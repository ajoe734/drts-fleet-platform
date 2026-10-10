-- PAX-BOOKING-HISTORY-20261009; allocated by passenger-app SD / schema-allocation.json.
BEGIN;

CREATE TABLE passenger.booking_histories (
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  order_id uuid PRIMARY KEY,
  fare_snapshot_id uuid NOT NULL REFERENCES passenger.fare_quote_snapshots(fare_snapshot_id),
  passenger_confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (passenger_confirmed_at <= created_at)
);

CREATE INDEX passenger_booking_histories_account_idx 
  ON passenger.booking_histories(drts_passenger_id, created_at DESC);

COMMIT;
