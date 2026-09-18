-- V0104__sr_partner_notification_binding_and_routing.sql
-- SR-PARTNER-NOTIFY-ROUTE-20260917: entry notification binding governance,
-- the frozen per-order notification route snapshot, and the durable
-- per-order notification event sequence counter.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (partner_notification_allocations[0], task SR-PARTNER-NOTIFY-CON-20260917, V0104
-- entry) — table_invariants there are the source of truth for every column,
-- constraint and comment below; this migration must not diverge from it.
--
-- Design: docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md
-- §3.1 (binding), §4 (order route), §5/§11 (sequence).
--
-- Invariants:
-- 1. One primary binding per entry (v1): entry_slug is the PK, binding_id is a
--    separately unique stable id referenced later by delivery contexts (V0105).
--    entry.tenant_id = binding.tenant_id = webhook.tenant_id and
--    entry.partner_id = binding.partner_id are verified in application code,
--    not by a DB CHECK — admin.phase1_tenant_webhook_endpoints carries no
--    partner_id column today.
-- 2. version is optimistic-concurrency only: a PUT is
--    `WHERE entry_slug = $1 AND version = $expectedVersion`, and the same
--    statement sets version = version + 1. A conflicting version must not be
--    silently overwritten.
-- 3. validated_endpoint_fingerprint / validated_at are null until a
--    passenger.notification.test.v1 binding test succeeds; enabling
--    (state -> 'ready') requires validated_endpoint_fingerprint to match the
--    endpoint's *current* fingerprint, never a stale one.
-- 4. mobility.phase1_order_partner_notification_routes is append-only: one
--    immutable route per order, no history table, no route_missing/
--    route_ambiguous/owner_changed placeholder row — those are absence-of-route
--    or stale-route *outcomes*, recorded elsewhere (V0105 delivery context),
--    never a row here. When an entry's tenant_id later changes, this row is
--    not rewritten.
-- 5. mobility.phase1_partner_notification_sequences is the sole durable
--    ordering authority for partner notifications — not the in-memory
--    passengerEventSequenceByOrder counter on MultiTaxiService (resets across
--    process restarts/reconnects, not durable). Allocation is
--    `UPDATE ... SET next_sequence = next_sequence + 1 WHERE order_id = $1
--    RETURNING next_sequence - 1 AS event_sequence`, executed in the same
--    transaction that creates the outbox row for that event; a retry of the
--    same logical event reuses the previously allocated sequence and must not
--    call the allocator a second time for that event.

CREATE TABLE IF NOT EXISTS admin.phase1_partner_notification_bindings (
  entry_slug varchar(150) PRIMARY KEY
    REFERENCES admin.phase1_partner_channel_entries(entry_slug),
  binding_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  webhook_id varchar(100) NOT NULL
    REFERENCES admin.phase1_tenant_webhook_endpoints(webhook_id),
  version integer NOT NULL DEFAULT 1,
  state varchar(20) NOT NULL DEFAULT 'test_pending'
    CHECK (state IN ('test_pending', 'ready', 'disabled')),
  purpose varchar(50) NOT NULL DEFAULT 'passenger_notification'
    CHECK (purpose = 'passenger_notification'),
  event_types jsonb NOT NULL,
  schema_version varchar(10) NOT NULL DEFAULT '1.0',
  acknowledgement_policy varchar(50) NOT NULL DEFAULT 'durable_partner_acceptance_v1'
    CHECK (acknowledgement_policy = 'durable_partner_acceptance_v1'),
  validated_endpoint_fingerprint text NULL,
  validated_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_partner_notification_bindings_binding_id UNIQUE (binding_id)
);

CREATE INDEX IF NOT EXISTS idx_phase1_partner_notification_bindings_tenant
  ON admin.phase1_partner_notification_bindings(tenant_id);

CREATE TABLE IF NOT EXISTS mobility.phase1_order_partner_notification_routes (
  order_id varchar(255) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  entry_slug varchar(150) NOT NULL
    REFERENCES admin.phase1_partner_channel_entries(entry_slug),
  partner_user_ref varchar(255) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  passenger_subject_ref varchar(255) NOT NULL,
  identity_linked_at timestamptz NOT NULL,
  consent_bundle_version varchar(50) NOT NULL,
  notification_policy_version varchar(50) NOT NULL DEFAULT 'partner_notification_v1'
    CHECK (notification_policy_version = 'partner_notification_v1'),
  ride_ref varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_order_partner_notification_routes_ride_ref UNIQUE (ride_ref)
);

CREATE INDEX IF NOT EXISTS idx_phase1_order_partner_notification_routes_entry
  ON mobility.phase1_order_partner_notification_routes(entry_slug);

CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_sequences (
  order_id varchar(255) PRIMARY KEY
    REFERENCES mobility.phase1_order_partner_notification_routes(order_id),
  next_sequence bigint NOT NULL DEFAULT 1
);
