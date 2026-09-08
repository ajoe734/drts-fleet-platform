-- V0089__owned_order_aggregate_version.sql
-- UV-EXEC-004: SD §7.5 -- "voice aggregate 以 DB row 與單調 aggregateVersion 為
-- 權威" requires a version column the application can use for optimistic
-- concurrency (compare-and-swap) on `ops.phase1_owned_orders`, and §7.5 also
-- requires that column stay consistent with the JSON `record` snapshot via
-- "單一 serializer／DB check", not two independently-written copies.
--
-- Following the exact convention V0088 already established for
-- call_id/voice_intent_id/etc on this same table, `aggregate_version` is a
-- `GENERATED ALWAYS ... STORED` column derived from `record`. It cannot drift
-- from the JSON by construction: the application bumps
-- `record.aggregateVersion` as part of the row's JSON payload on every
-- durable write, and this column is simply that value made queryable/
-- comparable in a `WHERE aggregate_version = $expected` compare-and-swap
-- clause. Legacy rows written before this migration (and any future write
-- that does not set the field, e.g. the still-non-transactional writers
-- tracked in docs/03-runbooks/uv-exec-004-writer-reader-inventory.md) default
-- to version 1 rather than NULL, so every row is always CAS-comparable.
--
-- Read-only integrity check (mirrors V0088 part 1): the GENERATED expression
-- casts `record->>'aggregateVersion'` to integer. Since this key does not
-- exist in any row written before this migration, the cast only ever sees
-- NULL today -- but check for the pathological case (a non-numeric string
-- already under that key) before adding the column, so a bad backfill fails
-- loudly here instead of aborting the ALTER TABLE with a generic cast error.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(order_id, ', ')
  INTO offending
  FROM (
    SELECT order_id, record ->> 'aggregateVersion' AS raw_version
    FROM ops.phase1_owned_orders
    WHERE record ->> 'aggregateVersion' IS NOT NULL
      AND record ->> 'aggregateVersion' !~ '^[0-9]+$'
  ) AS bad(order_id, raw_version);

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'ops.phase1_owned_orders has non-integer aggregateVersion value(s) in record for order_id(s): %. Fix or clear the field via an audited data-fix migration before this migration can add the generated aggregate_version column.',
      offending;
  END IF;
END $$;

ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS aggregate_version integer
    GENERATED ALWAYS AS (
      COALESCE(NULLIF(record ->> 'aggregateVersion', '')::integer, 1)
    ) STORED;

ALTER TABLE ops.phase1_owned_orders
  ADD CONSTRAINT chk_phase1_owned_orders_aggregate_version_positive
    CHECK (aggregate_version > 0);

-- No new index: `order_id` is already the primary key, so both the CAS read
-- (`SELECT ... WHERE order_id = $1 FOR UPDATE`) and write
-- (`UPDATE ... WHERE order_id = $1 AND aggregate_version = $2`) already hit
-- exactly one row via the existing PK index; `aggregate_version` there is
-- just a filter on that one row, not a second lookup key.
