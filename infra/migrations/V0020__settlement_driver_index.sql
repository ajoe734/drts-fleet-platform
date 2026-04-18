-- V0020__settlement_driver_index.sql
--
-- Adds a completed-trip driver lookup index for settlement generation so
-- per-driver statement queries can avoid scanning every completed task row.

CREATE INDEX IF NOT EXISTS idx_phase1_driver_tasks_settlement_driver_completed
  ON ops.phase1_driver_tasks (
    (record->>'driverId'),
    ((record->>'completedAt')::timestamptz) DESC
  )
  WHERE status = 'completed'
    AND COALESCE(record->>'driverId', '') <> ''
    AND COALESCE(record->>'completedAt', '') <> '';
