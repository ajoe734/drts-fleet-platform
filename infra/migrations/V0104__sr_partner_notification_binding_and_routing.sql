-- V0104__sr_partner_notification_binding_and_route.sql
-- SR-PARTNER-NOTIFY-ROUTE-20260917: Partner notification binding, routing and sequence

CREATE TABLE IF NOT EXISTS admin.phase1_partner_notification_bindings (
    entry_slug varchar(150) PRIMARY KEY,
    binding_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    tenant_id varchar(100) NOT NULL,
    partner_id varchar(100) NOT NULL,
    webhook_id varchar(100) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    state varchar(20) NOT NULL DEFAULT 'test_pending' CHECK (state IN ('test_pending','ready','disabled')),
    purpose varchar(50) NOT NULL DEFAULT 'passenger_notification' CHECK (purpose = 'passenger_notification'),
    event_types jsonb NOT NULL,
    acknowledgement_policy varchar(50) NOT NULL DEFAULT 'durable_partner_acceptance_v1' CHECK (acknowledgement_policy = 'durable_partner_acceptance_v1'),
    validated_endpoint_fingerprint text,
    validated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    record jsonb NOT NULL,
    CONSTRAINT fk_partner_notification_bindings_entry FOREIGN KEY (entry_slug) REFERENCES admin.phase1_partner_channel_entries(entry_slug),
    CONSTRAINT fk_partner_notification_bindings_webhook FOREIGN KEY (webhook_id) REFERENCES admin.phase1_tenant_webhook_endpoints(webhook_id)
);

CREATE TABLE IF NOT EXISTS mobility.phase1_order_partner_notification_routes (
    order_id varchar(255) PRIMARY KEY,
    tenant_id varchar(100) NOT NULL,
    partner_id varchar(100) NOT NULL,
    entry_slug varchar(150) NOT NULL,
    partner_user_ref varchar(255) NOT NULL,
    drts_passenger_id varchar(100) NOT NULL,
    passenger_subject_ref varchar(255) NOT NULL,
    identity_linked_at timestamptz NOT NULL,
    consent_bundle_version varchar(50) NOT NULL,
    notification_policy_version varchar(50) NOT NULL DEFAULT 'partner_notification_v1' CHECK (notification_policy_version = 'partner_notification_v1'),
    ride_ref varchar(255) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    record jsonb NOT NULL,
    CONSTRAINT fk_partner_notification_routes_entry FOREIGN KEY (entry_slug) REFERENCES admin.phase1_partner_channel_entries(entry_slug)
);

CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_sequences (
    order_id varchar(255) PRIMARY KEY,
    next_sequence bigint NOT NULL DEFAULT 1,
    CONSTRAINT fk_partner_notification_sequences_route FOREIGN KEY (order_id) REFERENCES mobility.phase1_order_partner_notification_routes(order_id)
);

