-- V0104__sr_partner_notification_binding_and_route.sql
-- SR-PARTNER-NOTIFY-ROUTE-20260917: Partner notification binding, routing and sequence

CREATE TABLE IF NOT EXISTS admin.phase1_partner_notification_bindings (
    entry_slug varchar(255) PRIMARY KEY,
    binding_id varchar(255) NOT NULL UNIQUE,
    tenant_id varchar(255) NOT NULL,
    partner_id varchar(255) NOT NULL,
    webhook_id varchar(255) NOT NULL,
    version integer NOT NULL,
    state varchar(50) NOT NULL,
    event_types jsonb NOT NULL,
    ack_policy varchar(100) NOT NULL,
    endpoint_fingerprint varchar(255),
    validated_at timestamptz,
    updated_at timestamptz NOT NULL,
    record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS mobility.phase1_order_partner_notification_routes (
    order_id varchar(255) PRIMARY KEY,
    tenant_id varchar(255) NOT NULL,
    partner_id varchar(255) NOT NULL,
    entry_slug varchar(255) NOT NULL,
    partner_user_ref varchar(255) NOT NULL,
    drts_passenger_id varchar(255) NOT NULL,
    passenger_subject_ref varchar(255) NOT NULL,
    identity_linked_at timestamptz NOT NULL,
    consent_bundle_version varchar(255) NOT NULL,
    notification_policy_version varchar(255) NOT NULL,
    ride_ref varchar(255) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_sequences (
    order_id varchar(255) PRIMARY KEY,
    next_sequence bigint NOT NULL
);
ALTER TABLE ops.consumer_notification_outbox ADD COLUMN event_sequence bigint;
