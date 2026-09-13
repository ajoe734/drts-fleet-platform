-- V0102__registry_expiry_processing.sql
-- SR-LAUNCH-SCHEMA-20260913: Dedicated Registry credential and policy expiry
-- processing records, source fingerprint tracking, lease protection, and
-- immutable alert delivery intents.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (SR-LAUNCH-SCHEMA-20260913, V0102 entry); implements consensus-packet.md §B4.
--
-- Invariants:
-- 1. Single reconciliation authority: scans PostgreSQL persistent data from
--    reg.phase1_registry_drivers and reg.phase1_registry_policies without requiring
--    ad-hoc scheduler processes, external timers, or mock dates.
-- 2. Deterministic source fingerprint: SHA-256 over canonical UTF-8 JSON tuple
--    guarantees exact source revision uniqueness:
--    - Driver: ["credential-expiry/v1", scope, "driver", driverId, sourceFieldName, Date.parse(expiry)]
--    - Policy: ["credential-expiry/v1", scope, "policy", policyId, vehicleId, policyNo, insuranceType, Date.parse(startAt), Date.parse(endAt), status]
--    Updated_at and derived lifecycle statuses are excluded.
-- 3. Strict locking order: source row lock (FOR UPDATE on driver or policy)
--    strictly precedes event row lock, ordered by entity ID in multi-row batches.
-- 4. Superseded invariant: when a renewed credential arrives, the source fingerprint changes;
--    a new event is created and previous un-superseded events for that entity/credential
--    are marked status='superseded' with superseded_at timestamp, preserving history
--    without corrupting original source validity.
-- 5. Concrete immutability boundary: delivery intent stores recipient, from, subject, body,
--    tenant_id, event_id, idempotency_key inside the domain transaction. A BEFORE UPDATE
--    trigger (reg.enforce_phase1_expiry_delivery_intent_immutability) strictly forbids
--    mutation of frozen identity and payload fields, while permitting status and outbox
--    bookkeeping transitions (delivery_status, outbox_delivery_id, last_error, enqueued_at, updated_at).

CREATE TABLE IF NOT EXISTS reg.phase1_registry_expiry_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(100) NOT NULL,
  entity_type varchar(50) NOT NULL CHECK (entity_type IN ('driver', 'policy')),
  entity_id varchar(100) NOT NULL,
  credential_type varchar(100) NOT NULL,
  source_fingerprint text NOT NULL,
  source_expiry_at timestamptz,
  status varchar(50) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'leased', 'completed', 'superseded', 'failed')
  ),
  attempt integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_token integer NOT NULL DEFAULT 0,
  leased_until timestamptz,
  worker_id text,
  last_error text,
  superseded_by_event_id uuid REFERENCES reg.phase1_registry_expiry_events (event_id),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reg_expiry_events_fingerprint UNIQUE (source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_reg_expiry_events_claimable
  ON reg.phase1_registry_expiry_events (status, run_after)
  WHERE status IN ('pending', 'leased');

CREATE INDEX IF NOT EXISTS idx_reg_expiry_events_entity
  ON reg.phase1_registry_expiry_events (entity_type, entity_id);

DROP TRIGGER IF EXISTS trg_touch_phase1_registry_expiry_events ON reg.phase1_registry_expiry_events;
CREATE TRIGGER trg_touch_phase1_registry_expiry_events
BEFORE UPDATE ON reg.phase1_registry_expiry_events
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS reg.phase1_registry_expiry_delivery_intents (
  intent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES reg.phase1_registry_expiry_events (event_id),
  scope varchar(100) NOT NULL,
  idempotency_key text NOT NULL,
  tenant_id varchar(100) NOT NULL,
  recipient_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  delivery_status varchar(50) NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'enqueued', 'sent', 'failed', 'superseded')
  ),
  outbox_delivery_id text,
  last_error text,
  enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reg_expiry_delivery_intents_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reg_expiry_delivery_intents_event
  ON reg.phase1_registry_expiry_delivery_intents (event_id);

-- Enforce concrete immutability boundary on delivery intent payload:
-- Frozen identity and content fields cannot drift on UPDATE;
-- only bookkeeping columns (delivery_status, outbox_delivery_id, last_error, enqueued_at, updated_at) are mutable.
CREATE OR REPLACE FUNCTION reg.enforce_phase1_expiry_delivery_intent_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.intent_id IS DISTINCT FROM OLD.intent_id OR
     NEW.event_id IS DISTINCT FROM OLD.event_id OR
     NEW.scope IS DISTINCT FROM OLD.scope OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.recipient_email IS DISTINCT FROM OLD.recipient_email OR
     NEW.from_email IS DISTINCT FROM OLD.from_email OR
     NEW.subject IS DISTINCT FROM OLD.subject OR
     NEW.body IS DISTINCT FROM OLD.body OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'phase1_delivery_intent_immutable_fields_violation: immutable payload fields (intent_id, event_id, scope, idempotency_key, tenant_id, recipient_email, from_email, subject, body, created_at) cannot be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_phase1_registry_expiry_delivery_intents_immutability
  ON reg.phase1_registry_expiry_delivery_intents;
CREATE TRIGGER trg_enforce_phase1_registry_expiry_delivery_intents_immutability
BEFORE UPDATE ON reg.phase1_registry_expiry_delivery_intents
FOR EACH ROW EXECUTE FUNCTION reg.enforce_phase1_expiry_delivery_intent_immutability();

DROP TRIGGER IF EXISTS trg_touch_phase1_registry_expiry_delivery_intents ON reg.phase1_registry_expiry_delivery_intents;
CREATE TRIGGER trg_touch_phase1_registry_expiry_delivery_intents
BEFORE UPDATE ON reg.phase1_registry_expiry_delivery_intents
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();
