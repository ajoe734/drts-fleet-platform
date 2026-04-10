-- V0007__crm_callcenter_and_complaints.sql

CREATE TABLE IF NOT EXISTS crm.call_sessions (
  call_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type crm.call_type_t NOT NULL,
  caller_phone varchar(50),
  agent_id uuid,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  recording_id uuid,
  linked_order_id uuid REFERENCES ops.orders(order_id),
  linked_case_no varchar(50),
  agent_identity_announced boolean NOT NULL DEFAULT false,
  status varchar(30) NOT NULL DEFAULT 'ended',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.call_recordings (
  recording_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES crm.call_sessions(call_id) ON DELETE CASCADE,
  object_key varchar(500) NOT NULL,
  duration_sec integer,
  checksum varchar(128),
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.complaint_cases (
  case_no varchar(50) PRIMARY KEY,
  case_source crm.case_source_t NOT NULL,
  related_order_id uuid REFERENCES ops.orders(order_id),
  related_call_id uuid REFERENCES crm.call_sessions(call_id),
  category varchar(100) NOT NULL,
  severity crm.case_severity_t NOT NULL DEFAULT 'medium',
  received_at timestamptz NOT NULL DEFAULT now(),
  assignee_id uuid,
  sla_due_at timestamptz,
  status crm.case_status_t NOT NULL DEFAULT 'new',
  resolution_code varchar(100),
  resolution_note text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.complaint_timelines (
  timeline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no varchar(50) NOT NULL REFERENCES crm.complaint_cases(case_no) ON DELETE CASCADE,
  event_type varchar(100) NOT NULL,
  actor_id uuid,
  note text,
  attachment_file_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_cases_order ON crm.complaint_cases(related_order_id);
CREATE INDEX IF NOT EXISTS idx_complaint_cases_status ON crm.complaint_cases(status);
