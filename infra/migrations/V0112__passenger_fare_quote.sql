-- PAX-FARE-QUOTE-20261009; allocated by passenger-app SD / schema-allocation.json.
BEGIN;

CREATE TABLE passenger.fare_versions (
  version varchar(100) PRIMARY KEY,
  status varchar(16) NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  effective_at timestamptz NOT NULL,
  effective_until timestamptz,
  base_fare integer NOT NULL CHECK (base_fare >= 0),
  base_distance_meters integer NOT NULL CHECK (base_distance_meters > 0),
  distance_rate integer NOT NULL CHECK (distance_rate >= 0),
  distance_increment_meters integer NOT NULL CHECK (distance_increment_meters > 0),
  delay_rate integer NOT NULL CHECK (delay_rate >= 0),
  delay_increment_seconds integer NOT NULL CHECK (delay_increment_seconds > 0),
  night_surcharge_bps integer NOT NULL CHECK (night_surcharge_bps BETWEEN 0 AND 10000),
  night_window_start varchar(5) NOT NULL CHECK (night_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  night_window_end varchar(5) NOT NULL CHECK (night_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  additional_fees jsonb NOT NULL CHECK (jsonb_typeof(additional_fees) = 'object'),
  distance_rounding varchar(8) NOT NULL CHECK (distance_rounding IN ('ceil', 'floor')),
  delay_rounding varchar(8) NOT NULL CHECK (delay_rounding IN ('ceil', 'floor')),
  total_rounding varchar(8) NOT NULL CHECK (total_rounding IN ('ceil', 'floor', 'nearest')),
  total_increment integer NOT NULL CHECK (total_increment > 0),
  night_application varchar(16) NOT NULL CHECK (night_application IN ('pickup', 'any_overlap')),
  source_reference text NOT NULL CHECK (length(trim(source_reference)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_at),
  CHECK (night_window_start <> night_window_end)
);
CREATE INDEX passenger_fare_versions_effective_idx
  ON passenger.fare_versions(effective_at, effective_until) WHERE status = 'published';

CREATE TABLE passenger.fare_quote_snapshots (
  fare_snapshot_id uuid PRIMARY KEY,
  drts_passenger_id varchar(100) NOT NULL REFERENCES passenger.accounts(drts_passenger_id),
  fare_version varchar(100) NOT NULL REFERENCES passenger.fare_versions(version),
  origin_lat double precision NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
  origin_lng double precision NOT NULL CHECK (origin_lng BETWEEN -180 AND 180),
  destination_lat double precision NOT NULL CHECK (destination_lat BETWEEN -90 AND 90),
  destination_lng double precision NOT NULL CHECK (destination_lng BETWEEN -180 AND 180),
  scheduled_at timestamptz NOT NULL,
  route jsonb NOT NULL CHECK (jsonb_typeof(route) = 'object'),
  tariff_snapshot jsonb NOT NULL CHECK (jsonb_typeof(tariff_snapshot) = 'object'),
  breakdown jsonb NOT NULL CHECK (jsonb_typeof(breakdown) = 'object'),
  service_area_evaluation jsonb NOT NULL CHECK (jsonb_typeof(service_area_evaluation) = 'object'),
  estimated_min bigint NOT NULL CHECK (estimated_min BETWEEN 0 AND 9007199254740991),
  estimated_max bigint NOT NULL CHECK (estimated_max BETWEEN estimated_min AND 9007199254740991),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (scheduled_at > created_at),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX passenger_fare_quote_owner_idx
  ON passenger.fare_quote_snapshots(drts_passenger_id, expires_at);

-- Deliberately NO SEED: SD 02_content_and_rules.md lists 85 / 1250m, 5 / 200m,
-- 5 / 80s and 23:00-06:00 +20%, but does not finalize effective date, distance/
-- delay/total rounding, or night application for journeys crossing the window.
-- Await approved source/SD before publishing any version; missing/ambiguous
-- effective versions fail closed as unavailable. No guessed fees or rates.
COMMIT;
