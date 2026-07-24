-- P5-RATE-003
-- Append-only moderation evidence for the server-owned rating invalidation
-- command. Rating mutation, aggregate rebuild, and this audit insert are
-- performed in one application transaction.

CREATE TABLE IF NOT EXISTS ops.passenger_rating_moderation_audits (
  audit_id varchar(255) PRIMARY KEY,
  rating_id varchar(255) NOT NULL
    REFERENCES ops.passenger_trip_ratings(rating_id),
  action text NOT NULL CHECK (action IN ('invalidate')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  actor_id varchar(255) NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  previous_status text NOT NULL
    CHECK (previous_status IN ('active', 'invalidated', 'under_review')),
  resulting_status text NOT NULL CHECK (resulting_status IN ('invalidated')),
  aggregate_version integer NOT NULL CHECK (aggregate_version >= 1),
  request_id varchar(255) NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (rating_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS passenger_rating_moderation_rating_time_idx
  ON ops.passenger_rating_moderation_audits (rating_id, created_at DESC);

CREATE INDEX IF NOT EXISTS passenger_rating_moderation_actor_time_idx
  ON ops.passenger_rating_moderation_audits (actor_id, created_at DESC);
