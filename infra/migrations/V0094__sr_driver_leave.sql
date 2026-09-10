-- V0094__sr_driver_leave.sql
-- SR-LEAVE-BE-001: 請假資料與審核／班次連動服務 (Gap N01, Capability C052)
-- References:
-- - docs/04-uat/system-remediation-20260906/feature-contracts.md §2
-- - docs/04-uat/system-remediation-20260906/schema-allocation.json

-- 1. Create table ops.phase1_driver_leave_requests
CREATE TABLE IF NOT EXISTS ops.phase1_driver_leave_requests (
  leave_id                    varchar(100) PRIMARY KEY,
  driver_id                   varchar(100) NOT NULL,
  leave_type                  varchar(50) NOT NULL CHECK (
    leave_type IN ('annual', 'sick', 'personal', 'bereavement', 'emergency')
  ),
  start_time                  timestamptz NOT NULL,
  end_time                    timestamptz NOT NULL,
  reason                      text NOT NULL,
  status                      varchar(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'withdrawn')
  ),
  reviewed_by_principal_id    varchar(100),
  reviewed_at                 timestamptz,
  review_notes                text,
  impacted_shift_ids          text[] NOT NULL DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  record                      jsonb NOT NULL
);

-- 2. Indexes for efficient lookup and conflict queries
CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver
  ON ops.phase1_driver_leave_requests(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_status
  ON ops.phase1_driver_leave_requests(status);

CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver_status
  ON ops.phase1_driver_leave_requests(driver_id, status);

CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_time_range
  ON ops.phase1_driver_leave_requests(start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver_time
  ON ops.phase1_driver_leave_requests(driver_id, start_time, end_time);

-- 3. Relax foreign key on ops.phase1_driver_matching_suppressions to allow leave-originated suppressions
ALTER TABLE ops.phase1_driver_matching_suppressions
  DROP CONSTRAINT IF EXISTS phase1_driver_matching_suppressions_source_incident_id_fkey;
