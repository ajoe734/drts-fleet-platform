-- Durable cross-process pending-commit identity for an ordinary (non-settlement)
-- complaint mutation. pending is the durable PREPARED state, written before the
-- business transaction; confirmed changes atomically with case/timeline. A same-logical-
-- command retry recovers the originally allocated caseNo/entryId after an API
-- restart or on a different replica, not only within the originating process's
-- in-memory pendingUncertainCommits Map.
CREATE TABLE IF NOT EXISTS crm.phase1_complaint_pending_commits (
  command_key varchar(64) PRIMARY KEY,
  case_no varchar(100) NOT NULL,
  action varchar(100) NOT NULL,
  command_payload jsonb NOT NULL,
  case_snapshot jsonb NOT NULL,
  timeline_snapshot jsonb NOT NULL,
  previous_case_snapshot jsonb,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase1_complaint_pending_commits_case_no
  ON crm.phase1_complaint_pending_commits(case_no);

-- Two replicas may allocate the same display sequence concurrently. Reserve
-- each original create caseNo once before either can reach business COMMIT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_complaint_prepared_create_case_no
  ON crm.phase1_complaint_pending_commits(case_no)
  WHERE action = 'create_complaint_case';
