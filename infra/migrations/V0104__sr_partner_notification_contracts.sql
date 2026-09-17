-- V0104__sr_partner_notification_contracts.sql
-- SR-PARTNER-NOTIFY-CON-20260917: Partner notification contracts and schema
-- Allocation authority: SR-PARTNER-NOTIFY-CON-20260917 task brief.

CREATE TABLE IF NOT EXISTS admin.phase1_partner_notification_bindings (
  entry_slug varchar(150) PRIMARY KEY,
  binding_id uuid UNIQUE NOT NULL,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  webhook_id varchar(100) NOT NULL,
  version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('test_pending', 'ready', 'disabled')),
  purpose text NOT NULL CHECK (purpose = 'passenger_notification'),
  event_types jsonb NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = '1.0'),
  acknowledgement_policy text NOT NULL CHECK (acknowledgement_policy = 'durable_partner_acceptance_v1'),
  validated_endpoint_fingerprint text NULL,
  validated_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobility.phase1_order_partner_notification_routes (
  order_id uuid PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL,
  partner_user_ref text NOT NULL,
  drts_passenger_id text NOT NULL,
  passenger_subject_ref text NOT NULL,
  identity_linked_at timestamptz NOT NULL,
  consent_bundle_version text NOT NULL,
  notification_policy_version text NOT NULL CHECK (notification_policy_version = 'partner_notification_v1'),
  ride_ref text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_delivery_contexts (
  outbox_id varchar(255) PRIMARY KEY,
  delivery_id uuid UNIQUE NOT NULL,
  order_id uuid NOT NULL REFERENCES mobility.phase1_order_partner_notification_routes(order_id),
  route_snapshot jsonb NOT NULL,
  binding_snapshot jsonb NOT NULL,
  wire_payload_hash text NOT NULL,
  event_sequence bigint NOT NULL,
  expires_at timestamptz NULL,
  retry_disposition text NOT NULL CHECK (retry_disposition IN ('automatic', 'configuration_blocked', 'manual_only', 'terminal', 'none')),
  failure_reason text NULL,
  ack_evidence jsonb NULL,
  delivery_target text NULL CHECK (delivery_target = 'partner_endpoint'),
  delivery_stage text NULL CHECK (delivery_stage = 'partner_accepted'),
  receipt_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_sequences (
  order_id uuid PRIMARY KEY REFERENCES mobility.phase1_order_partner_notification_routes(order_id),
  next_sequence bigint NOT NULL DEFAULT 1
);
