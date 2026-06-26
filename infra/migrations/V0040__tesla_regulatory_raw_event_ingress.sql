-- Tesla regulatory ingress vault + idempotency support.
-- Adds immutable raw-event custody and provider idempotency metadata for
-- /internal/providers/tesla/regulatory-events.

CREATE TABLE IF NOT EXISTS av_sandbox.tesla_regulatory_raw_events (
  raw_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code varchar(100) NOT NULL,
  provider_identity text NOT NULL,
  provider_event_id varchar(200) NOT NULL,
  schema_version text NOT NULL,
  payload_sha256 varchar(64) NOT NULL,
  payload_body text NOT NULL,
  payload_bytes integer NOT NULL,
  raw_headers text[] NOT NULL DEFAULT ARRAY[]::text[],
  jws_protected_header jsonb NOT NULL DEFAULT '{}'::jsonb,
  jws_signature text NOT NULL,
  jws_kid varchar(200) NOT NULL,
  jws_alg varchar(32) NOT NULL,
  jws_issued_at timestamptz NOT NULL,
  mtls_client_cert text NOT NULL,
  mtls_fingerprint text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  occurred_at timestamptz NOT NULL,
  normalization_status text NOT NULL,
  canonical_event_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_tesla_regulatory_raw_events_received
  ON av_sandbox.tesla_regulatory_raw_events(received_at DESC);

ALTER TABLE av_sandbox.tesla_regulatory_events
  ADD COLUMN IF NOT EXISTS provider_code varchar(100) NULL,
  ADD COLUMN IF NOT EXISTS provider_event_id varchar(200) NULL,
  ADD COLUMN IF NOT EXISTS payload_sha256 varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS raw_event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS ingest_status text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tesla_regulatory_events_provider_event
  ON av_sandbox.tesla_regulatory_events(provider_code, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tesla_regulatory_events_raw_event
  ON av_sandbox.tesla_regulatory_events(raw_event_id)
  WHERE raw_event_id IS NOT NULL;
