-- V0093__voice_retention_and_legal_hold.sql
-- UV-EXEC-021: Voice evidence retention, legal hold, and privileged archival bypass (SD §9.2 / §13 / §15).
--
-- 1. Updates voice.raise_append_only() to allow privileged retention archival
--    during lawful retention sweeps only when session flag
--    'voice.allow_retention_archival = on' is set in the transaction boundary.
-- 2. Creates voice.legal_hold table for tracking legal holds placed by platform_admin or ops_user.
-- 3. Creates voice.retention_execution_log for append-only audit of retention purge sweeps.

-- 1. Update raise_append_only to support privileged retention deletion
CREATE OR REPLACE FUNCTION voice.raise_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Privileged retention archival: permitted for DELETE only when session setting is 'on'
  IF TG_OP = 'DELETE'
     AND current_setting('voice.allow_retention_archival', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

-- 2. voice.legal_hold table
CREATE TABLE IF NOT EXISTS voice.legal_hold (
  hold_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number varchar(100) NOT NULL,
  evidence_family varchar(100) NOT NULL,
  subject_ref varchar(200) NOT NULL,
  reason_code varchar(50) NOT NULL CHECK (
    reason_code IN (
      'complaint_escalation',
      'regulatory_inquiry',
      'settlement_dispute',
      'internal_investigation',
      'other'
    )
  ),
  notes text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  placed_by varchar(100) NOT NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_by varchar(100),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_legal_hold_active
  ON voice.legal_hold (evidence_family, subject_ref)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_voice_legal_hold_case
  ON voice.legal_hold (case_number);

DROP TRIGGER IF EXISTS trg_touch_voice_legal_hold ON voice.legal_hold;
CREATE TRIGGER trg_touch_voice_legal_hold
BEFORE UPDATE ON voice.legal_hold
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 3. voice.retention_execution_log
CREATE TABLE IF NOT EXISTS voice.retention_execution_log (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_family varchar(100) NOT NULL,
  mode varchar(20) NOT NULL CHECK (mode IN ('dry-run', 'apply')),
  retention_days integer NOT NULL,
  candidates_count integer NOT NULL,
  purged_count integer NOT NULL,
  skipped_held_count integer NOT NULL,
  operator_id varchar(100) NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

SELECT voice._make_append_only('voice.retention_execution_log');
