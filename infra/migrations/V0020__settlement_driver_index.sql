-- V0020__settlement_driver_index.sql
--
-- Adds a completed-trip driver lookup index for settlement generation so
-- per-driver statement queries can avoid scanning every completed task row.
--
-- The raw `completedAt` payloads are canonical UTC ISO-8601 strings in the
-- live write path. Index the validated string value directly because
-- `timestamptz` casts are not immutable and therefore cannot participate in
-- an index expression or predicate. Historical malformed snapshots are
-- filtered out so the migration remains safe on existing staging data.

CREATE INDEX IF NOT EXISTS idx_phase1_driver_tasks_settlement_driver_completed
  ON ops.phase1_driver_tasks (
    (record->>'driverId'),
    (record->>'completedAt') DESC
  )
  WHERE status = 'completed'
    AND COALESCE(record->>'driverId', '') <> ''
    AND COALESCE(record->>'completedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$';
