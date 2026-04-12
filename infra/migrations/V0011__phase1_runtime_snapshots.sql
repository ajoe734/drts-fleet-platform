-- V0011__phase1_runtime_snapshots.sql
--
-- Contract-aligned runtime snapshot tables for the in-flight Wave 7
-- persistence migration. These tables store the exact API-facing record
-- shapes so Phase 1 services can rehydrate state from Postgres without
-- forcing a simultaneous canonical schema rewrite.

CREATE TABLE IF NOT EXISTS ops.phase1_owned_orders (
  order_id varchar(100) PRIMARY KEY,
  order_no varchar(100) NOT NULL UNIQUE,
  status varchar(50) NOT NULL,
  order_source varchar(50) NOT NULL,
  service_bucket varchar(50) NOT NULL,
  dispatch_semantics varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_dispatch_jobs (
  dispatch_job_id varchar(100) PRIMARY KEY,
  order_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_dispatch_attempts (
  attempt_id varchar(100) PRIMARY KEY,
  dispatch_job_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  sequence integer NOT NULL,
  outcome varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_dispatch_assignments (
  assignment_id varchar(100) PRIMARY KEY,
  dispatch_job_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  task_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_driver_tasks (
  task_id varchar(100) PRIMARY KEY,
  order_id varchar(100) NOT NULL,
  dispatch_job_id varchar(100) NOT NULL,
  assignment_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_dispatch_trace_logs (
  trace_id varchar(100) PRIMARY KEY,
  order_id varchar(100) NOT NULL,
  event_type varchar(100) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.phase1_call_sessions (
  call_id varchar(100) PRIMARY KEY,
  status varchar(50) NOT NULL,
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.phase1_complaint_cases (
  case_no varchar(100) PRIMARY KEY,
  status varchar(50) NOT NULL,
  sla_due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.phase1_complaint_timelines (
  entry_id varchar(100) PRIMARY KEY,
  case_no varchar(100) NOT NULL,
  action varchar(100) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_owned_orders_status
  ON ops.phase1_owned_orders(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_dispatch_jobs_order
  ON ops.phase1_dispatch_jobs(order_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_dispatch_attempts_job
  ON ops.phase1_dispatch_attempts(dispatch_job_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_dispatch_assignments_order
  ON ops.phase1_dispatch_assignments(order_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_tasks_driver_status
  ON ops.phase1_driver_tasks(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_dispatch_trace_logs_order
  ON ops.phase1_dispatch_trace_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_call_sessions_status
  ON crm.phase1_call_sessions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_complaint_cases_status
  ON crm.phase1_complaint_cases(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_complaint_timelines_case
  ON crm.phase1_complaint_timelines(case_no, created_at ASC);
