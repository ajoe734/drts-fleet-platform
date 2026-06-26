-- Tesla telemetry provider health, sequence tracking, and backfill support.
-- Adds per-feed ingest metadata so missing-sequence / stale-heartbeat detection,
-- unknown-schema quarantine, and dispatch-hold health queries can persist.

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_provider_telemetry_events (
  telemetry_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code varchar(100) NOT NULL,
  feed_kind text NOT NULL,
  vehicle_id varchar(100) NULL,
  external_vehicle_ref varchar(200) NOT NULL,
  session_id varchar(200) NOT NULL DEFAULT '',
  provider_event_id varchar(200) NOT NULL,
  sequence_no bigint NOT NULL,
  captured_at timestamptz NOT NULL,
  source_schema_version text NOT NULL,
  payload_sha256 varchar(64) NOT NULL,
  payload_body jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  ingest_status text NOT NULL,
  quarantine_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, feed_kind, provider_event_id),
  UNIQUE (provider_code, feed_kind, external_vehicle_ref, session_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_tesla_provider_telemetry_events_lookup
  ON av_sandbox.tesla_provider_telemetry_events(
    provider_code,
    feed_kind,
    external_vehicle_ref,
    session_id,
    captured_at DESC
  );

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_provider_health (
  provider_code varchar(100) NOT NULL,
  feed_kind text NOT NULL,
  external_vehicle_ref varchar(200) NOT NULL,
  session_id varchar(200) NOT NULL DEFAULT '',
  health_state text NOT NULL,
  quality_score double precision NOT NULL,
  dispatch_hold boolean NOT NULL DEFAULT false,
  latest_event_id varchar(200) NULL,
  latest_sequence_no bigint NULL,
  latest_contiguous_sequence_no bigint NULL,
  missing_sequences jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_captured_at timestamptz NULL,
  last_received_at timestamptz NULL,
  stale_heartbeat_at timestamptz NULL,
  gap_detected_at timestamptz NULL,
  backfill_requested_at timestamptz NULL,
  completed_at timestamptz NULL,
  issue_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  evaluated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_code, feed_kind, external_vehicle_ref, session_id)
);

CREATE INDEX IF NOT EXISTS idx_tesla_provider_health_dispatch_hold
  ON av_sandbox.tesla_provider_health(dispatch_hold, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_provider_backfill_requests (
  backfill_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code varchar(100) NOT NULL,
  feed_kind text NOT NULL,
  vin varchar(200) NOT NULL,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  session_id varchar(200) NULL,
  event_id varchar(200) NULL,
  sequence_after bigint NULL,
  page_token text NULL,
  status text NOT NULL,
  detected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tesla_provider_backfill_requests_vin
  ON av_sandbox.tesla_provider_backfill_requests(
    provider_code,
    feed_kind,
    vin,
    detected_at DESC
  );
