-- V0107__push_channel_first_party_registry_and_routing.sql
-- PUSH-FIRST-PARTY-REGISTRY-20261006: first-party passenger push device
-- registry and the first-party per-order notification route snapshot.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (passenger_push_channel_allocations[0], task PUSH-CHANNEL-SD-20261006, V0107
-- entry) — table_invariants there are the source of truth for every column,
-- constraint and index below; this migration must not diverge from it.
--
-- Design: docs/02-architecture/passenger-notification-channel-routing-20261006.md
-- D4 (device registry), D5 (first-party order route), D2 (mutual exclusion
-- with mobility.phase1_order_partner_notification_routes, V0104).
--
-- Invariants:
-- 1. Uniqueness on (provider, token_sha256) is a *partial* index limited to
--    `status = 'active'` rows, not a table-wide UNIQUE: a rebind or
--    rotation inserts a new 'active' row in the same transaction that flips
--    the prior row to 'revoked', and the prior row must keep existing
--    (status='revoked') for audit history rather than being deleted or
--    overwritten in place.
-- 2. No writer exists yet for either table in this wave (no first-party
--    passenger identity or booking path calls them); this migration only
--    creates schema.
-- 3. No FK between the two tables or to any order table: each route table
--    (partner V0104, first-party here) is independent per D2/D5, and
--    `order_id` here is a plain varchar(255) matching V0104's column type,
--    not cast from/to another identifier type.

CREATE TABLE IF NOT EXISTS iam.phase1_passenger_push_devices (
  device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drts_passenger_id varchar(100) NOT NULL,
  platform varchar(10) NOT NULL
    CHECK (platform IN ('ios', 'android')),
  provider varchar(20) NOT NULL DEFAULT 'fcm_v1'
    CHECK (provider = 'fcm_v1'),
  app_id varchar(150) NOT NULL,
  app_version varchar(50) NOT NULL,
  token text NOT NULL,
  token_sha256 varchar(64) NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'invalid')),
  status_reason text NULL,
  notification_consent_version varchar(50) NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NULL,
  invalidated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one 'active' row per (provider, token_sha256) at a time; any
-- number of historical 'revoked'/'invalid' rows may share a hash.
CREATE UNIQUE INDEX IF NOT EXISTS phase1_passenger_push_devices_active_token_uq
  ON iam.phase1_passenger_push_devices (provider, token_sha256)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_phase1_passenger_push_devices_passenger
  ON iam.phase1_passenger_push_devices (drts_passenger_id, status);

CREATE TABLE IF NOT EXISTS mobility.phase1_order_first_party_notification_routes (
  order_id varchar(255) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  drts_passenger_id varchar(100) NOT NULL,
  passenger_subject_ref varchar(255) NOT NULL,
  app_id varchar(150) NOT NULL,
  notification_policy_version varchar(50) NOT NULL DEFAULT 'first_party_notification_v1'
    CHECK (notification_policy_version = 'first_party_notification_v1'),
  consent_version varchar(50) NOT NULL,
  ride_ref varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_phase1_order_first_party_notification_routes_ride_ref UNIQUE (ride_ref)
);
