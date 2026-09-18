-- V0082__call_session_order_cardinality.sql
-- One relationship, two schemas, opposite cardinalities.
--
-- `crm.call_sessions.linked_order_id` is a single nullable FK: at most one order
-- per call. `ops.orders.call_id` is a plain nullable column with no unique
-- constraint: any number of orders per call. Both describe the same link, and
-- they disagree about how many orders a call may produce.
--
-- The decision (PHASE1_OPEN_QUESTIONS Q-001, 2026-08-19) is one order per call
-- for now; multi-order was considered and deliberately deferred. This makes the
-- order side say that too, so the constraint lives where it can be enforced
-- rather than only where it happens to be modelled.
--
-- If this migration fails, it is reporting real data that contradicts the
-- decision. Resolve the duplicates, or revisit Q-001 -- do not drop the index.

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(call_id::text, ', ')
    INTO offending
  FROM (
    SELECT call_id
    FROM ops.orders
    WHERE call_id IS NOT NULL
    GROUP BY call_id
    HAVING count(*) > 1
    LIMIT 20
  ) AS duplicates;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'ops.orders already holds more than one order for call_id(s): %. Q-001 decided one order per call; reconcile the data or reopen the decision.',
      offending;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ops_orders_call_id_unique
  ON ops.orders (call_id)
  WHERE call_id IS NOT NULL;

COMMENT ON INDEX ops.ops_orders_call_id_unique IS
  'One order per call session (Q-001, 2026-08-19). Mirrors the single FK on crm.call_sessions.linked_order_id.';
