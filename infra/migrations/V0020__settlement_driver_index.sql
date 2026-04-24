-- V0020__settlement_driver_index.sql
--
-- Adds a completed-trip driver lookup index for settlement generation so
-- per-driver statement queries can avoid scanning every completed task row.
--
-- Some historical snapshots carry malformed `record.completedAt` strings.
-- Guard the cast so the index skips invalid timestamps instead of failing
-- the whole migration on live data.

CREATE INDEX IF NOT EXISTS idx_phase1_driver_tasks_settlement_driver_completed
  ON ops.phase1_driver_tasks (
    (record->>'driverId'),
    (
      CASE
        WHEN COALESCE(record->>'completedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
          THEN (record->>'completedAt')::timestamptz
        ELSE NULL
      END
    ) DESC
  )
  WHERE status = 'completed'
    AND COALESCE(record->>'driverId', '') <> ''
    AND (
      CASE
        WHEN COALESCE(record->>'completedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
          THEN (record->>'completedAt')::timestamptz
        ELSE NULL
      END
    ) IS NOT NULL;
