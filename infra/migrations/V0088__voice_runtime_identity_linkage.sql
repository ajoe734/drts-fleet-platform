-- V0088__voice_runtime_identity_linkage.sql
-- UV-EXEC-002: SD §7.5 -- the tables the application actually writes at
-- runtime are `ops.phase1_owned_orders` and `crm.phase1_call_sessions`
-- (varchar ids, `record jsonb` snapshot), not the mostly-empty canonical
-- `ops.orders` / `crm.call_sessions` (uuid ids) that V0082 constrained.
-- V0082's `ops_orders_call_id_unique` is real but sits on the wrong table
-- for voice-booking dedup purposes; this migration adds the equivalent
-- constraint -- and the new voice-specific identity columns -- on the real
-- runtime tables, without touching V0082 or the canonical schema.
--
-- Read-only integrity check (part 1): before adding any constraint, this
-- migration first checks the *existing* data for the exact conditions the
-- new constraints would reject. This mirrors V0082's own pattern: if
-- historical data already violates the invariant, the migration fails loudly
-- with the offending ids instead of silently deleting or truncating
-- historical orders/call sessions to make an index buildable.
--
-- Remediation strategy if this migration fails:
--   1. Do not delete or truncate the reported rows. They are historical
--      orders/call sessions and are themselves evidence.
--   2. For duplicate call_id on ops.phase1_owned_orders: identify which of
--      the orders sharing a call_id is the authoritative one (usually the
--      earliest by created_at unless a manual correction is documented) and
--      correct/null the callId field on the JSON `record` of the others via
--      an explicit, audited, one-off data-fix migration -- not by dropping
--      rows.
--   3. Re-run `operations/database/db-apply.sh` after the data fix; this
--      migration is idempotent (guarded by IF NOT EXISTS / ADD COLUMN IF NOT
--      EXISTS) and safe to retry.
--
-- No cross-table FK between ops.phase1_owned_orders.call_id and
-- crm.phase1_call_sessions.call_id/linked_order_id: the existing
-- call-center booking writer (OwnedMobilityService.createCallCenterOrder ->
-- CallcenterService.linkOrderToCallSession, apps/api/src/modules/
-- owned-mobility/owned-mobility.service.ts and
-- apps/api/src/modules/callcenter/callcenter.service.ts) persists the order
-- and the call-session link as two independent, unawaited
-- (`void Promise.all(...).catch(...)`) writes, not one transaction, and does
-- not guarantee the order row lands before the session's linkedOrderId
-- write. A hard, immediately-checked FK across that cycle broke exactly
-- that legacy path in CI (cross-surface-e2e / E2E-022-operations-reporting:
-- `fk_phase1_call_sessions_linked_order` / `fk_phase1_owned_orders_call_id`
-- violations from a real call-center order, not a test bug). Per SD §15.2
-- writers for this domain land in later UV-EXEC-* tasks; until that writer
-- is made transactional/ordered, this migration only keeps the UNIQUE
-- indexes (dedup: one order per call, one call per order) and reports
-- dangling references as a read-only NOTICE (part 2 below) instead of
-- enforcing them with a blocking FK.
--
-- The same checks are also published as a standalone, non-blocking,
-- read-only script at
-- `operations/database/voice-runtime-integrity-check.sql` so they can be run
-- at any time (not just at migration time) to catch drift introduced after
-- this migration has already succeeded once.

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(call_id, ', ')
    INTO offending
  FROM (
    SELECT NULLIF(record ->> 'callId', '') AS call_id
    FROM ops.phase1_owned_orders
    WHERE NULLIF(record ->> 'callId', '') IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
    LIMIT 20
  ) AS duplicates;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'ops.phase1_owned_orders already holds more than one order for call_id(s): %. SD §7.5/Q-001 decided one order per call; reconcile the JSON record data before this migration can add the unique index.',
      offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(o.order_id, ', ')
    INTO offending
  FROM (
    SELECT order_id, NULLIF(record ->> 'callId', '') AS call_id
    FROM ops.phase1_owned_orders
    WHERE NULLIF(record ->> 'callId', '') IS NOT NULL
    LIMIT 2000
  ) AS o
  LEFT JOIN crm.phase1_call_sessions cs ON cs.call_id = o.call_id
  WHERE cs.call_id IS NULL
  LIMIT 20;

  IF offending IS NOT NULL THEN
    RAISE NOTICE
      'voice-runtime-integrity: ops.phase1_owned_orders has order(s) % referencing a callId with no matching crm.phase1_call_sessions row. Not blocking this migration (no FK is added for this pair -- see the file header); see operations/database/voice-runtime-integrity-check.sql for the remediation runbook.',
      offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(order_id_ref, ', ')
    INTO offending
  FROM (
    SELECT NULLIF(record ->> 'voiceIntentId', '') AS voice_intent_id
    FROM ops.phase1_owned_orders
    WHERE NULLIF(record ->> 'voiceIntentId', '') IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
    LIMIT 20
  ) AS duplicates(order_id_ref);

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'ops.phase1_owned_orders already holds more than one order for voice_intent_id(s): %. SD §7.2 requires UNIQUE(voice_intent_id); reconcile before this migration can add the unique index.',
      offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(call_id, ', ')
    INTO offending
  FROM (
    SELECT NULLIF(record ->> 'linkedOrderId', '') AS linked_order_id
    FROM crm.phase1_call_sessions
    WHERE NULLIF(record ->> 'linkedOrderId', '') IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
    LIMIT 20
  ) AS duplicates(call_id);

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'crm.phase1_call_sessions already links more than one call session to linked_order_id(s): %. SD §7.5 requires one order per call from both sides; reconcile before this migration can add the unique index.',
      offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(cs.call_id, ', ')
    INTO offending
  FROM (
    SELECT call_id, NULLIF(record ->> 'linkedOrderId', '') AS linked_order_id
    FROM crm.phase1_call_sessions
    WHERE NULLIF(record ->> 'linkedOrderId', '') IS NOT NULL
    LIMIT 2000
  ) AS cs
  LEFT JOIN ops.phase1_owned_orders o ON o.order_id = cs.linked_order_id
  WHERE o.order_id IS NULL
  LIMIT 20;

  IF offending IS NOT NULL THEN
    RAISE NOTICE
      'voice-runtime-integrity: crm.phase1_call_sessions has call session(s) % referencing a linkedOrderId with no matching ops.phase1_owned_orders row. Not blocking this migration (no FK is added for this pair -- see the file header); see operations/database/voice-runtime-integrity-check.sql for the remediation runbook.',
      offending;
  END IF;
END $$;

-- Read-only integrity check (part 2): JSON `record` vs. real column drift on
-- the columns that already exist and are written independently of the JSON
-- blob. These are reported, not enforced by a blocking CHECK, because
-- retrofitting a hard constraint onto columns with pre-existing independent
-- writers could reject writes from code this migration has not audited.
-- Fixing confirmed drift is an explicit follow-up: correct whichever side is
-- stale (usually the JSON `record`, since the typed column is what indexes
-- and FKs rely on) via an audited data-fix, not a schema change.
DO $$
DECLARE
  status_drift bigint;
  call_status_drift bigint;
BEGIN
  SELECT count(*) INTO status_drift
  FROM ops.phase1_owned_orders
  WHERE record ->> 'status' IS DISTINCT FROM status;

  SELECT count(*) INTO call_status_drift
  FROM crm.phase1_call_sessions
  WHERE record ->> 'status' IS DISTINCT FROM status;

  IF status_drift > 0 THEN
    RAISE NOTICE
      'voice-runtime-integrity: % ops.phase1_owned_orders row(s) have record->>''status'' different from the status column. Not blocking this migration; see operations/database/voice-runtime-integrity-check.sql for the remediation runbook.',
      status_drift;
  END IF;

  IF call_status_drift > 0 THEN
    RAISE NOTICE
      'voice-runtime-integrity: % crm.phase1_call_sessions row(s) have record->>''status'' different from the status column. Not blocking this migration; see operations/database/voice-runtime-integrity-check.sql for the remediation runbook.',
      call_status_drift;
  END IF;
END $$;

-- New identity columns are GENERATED ALWAYS so they can never drift from the
-- JSON `record` that produced them (SD §7.5: "以單一 serializer／DB check 保持和
-- JSON record 一致"). Existing columns (status, order_no, ...) are left
-- alone; retrofitting them is out of this migration's scope (see NOTICE
-- above).
ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS call_id varchar(100)
    GENERATED ALWAYS AS (NULLIF(record ->> 'callId', '')) STORED,
  ADD COLUMN IF NOT EXISTS voice_intent_id uuid
    GENERATED ALWAYS AS (NULLIF(record ->> 'voiceIntentId', '')::uuid) STORED,
  ADD COLUMN IF NOT EXISTS booking_actor_type varchar(20)
    GENERATED ALWAYS AS (NULLIF(record #>> '{bookingActor,type}', '')) STORED,
  ADD COLUMN IF NOT EXISTS customer_confirmation_id uuid
    GENERATED ALWAYS AS (NULLIF(record ->> 'customerConfirmationId', '')::uuid) STORED,
  ADD COLUMN IF NOT EXISTS recording_evidence_ref text
    GENERATED ALWAYS AS (NULLIF(record ->> 'recordingEvidenceRef', '')) STORED;

ALTER TABLE ops.phase1_owned_orders
  ADD CONSTRAINT chk_phase1_owned_orders_booking_actor_type
    CHECK (booking_actor_type IS NULL OR booking_actor_type IN ('voice_agent', 'human'));

-- SD §7.2: "另在 owned order 增 UNIQUE(voice_intent_id)（非空時）".
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_owned_orders_voice_intent
  ON ops.phase1_owned_orders (voice_intent_id)
  WHERE voice_intent_id IS NOT NULL;

-- SD §7.5: the real-runtime-table equivalent of V0082's
-- `ops_orders_call_id_unique`, which sits on the mostly-empty canonical
-- `ops.orders` and cannot enforce anything against what the app writes.
--
-- No FK to crm.phase1_call_sessions (call_id) here: see the file header --
-- the existing call-center writer persists the order and the call-session
-- link as two independent, unordered writes, and a hard FK on this pair
-- broke that legacy path in CI. Dangling references are reported, not
-- enforced (see the NOTICE check above and
-- operations/database/voice-runtime-integrity-check.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_owned_orders_call_id
  ON ops.phase1_owned_orders (call_id)
  WHERE call_id IS NOT NULL;

ALTER TABLE crm.phase1_call_sessions
  ADD COLUMN IF NOT EXISTS linked_order_id varchar(100)
    GENERATED ALWAYS AS (NULLIF(record ->> 'linkedOrderId', '')) STORED,
  ADD COLUMN IF NOT EXISTS voice_session_id uuid
    GENERATED ALWAYS AS (NULLIF(record ->> 'voiceSessionId', '')::uuid) STORED,
  ADD COLUMN IF NOT EXISTS source_channel varchar(20)
    GENERATED ALWAYS AS (NULLIF(record ->> 'sourceChannel', '')) STORED;

ALTER TABLE crm.phase1_call_sessions
  ADD CONSTRAINT chk_phase1_call_sessions_source_channel
    CHECK (source_channel IS NULL OR source_channel IN ('voice_agent', 'human'));

-- No FK to ops.phase1_owned_orders (order_id) here: see the file header and
-- the matching note on uq_phase1_owned_orders_call_id above -- same legacy
-- writer, same non-transactional ordering hazard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_call_sessions_linked_order
  ON crm.phase1_call_sessions (linked_order_id)
  WHERE linked_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_call_sessions_voice_session
  ON crm.phase1_call_sessions (voice_session_id)
  WHERE voice_session_id IS NOT NULL;

-- voice.session references crm.phase1_call_sessions(call_id) directly
-- (added in V0086); voice_session_id here closes the loop so a call session
-- row can be resolved to its voice_session without a join through orders.
ALTER TABLE crm.phase1_call_sessions
  ADD CONSTRAINT fk_phase1_call_sessions_voice_session
    FOREIGN KEY (voice_session_id) REFERENCES voice.session (voice_session_id);
