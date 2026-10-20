-- Fleet decisions retain the statement actually reviewed. Monthly generation
-- replaces statement rows, so this record deliberately has no cascading FK to
-- billing.phase1_fleet_partner_statements.
CREATE TABLE IF NOT EXISTS billing.phase1_fleet_statement_decisions (
  statement_id varchar(100) PRIMARY KEY,
  fleet_partner_id varchar(100) NOT NULL,
  period_month varchar(20) NOT NULL,
  decision_status varchar(20) NOT NULL CHECK (decision_status IN ('confirmed', 'disputed')),
  decision_note text NOT NULL,
  decided_by varchar(255) NOT NULL,
  decided_at timestamptz NOT NULL,
  dispute_case_id varchar(100) NULL REFERENCES crm.phase1_complaint_cases(case_no),
  statement_snapshot jsonb NOT NULL,
  CHECK ((decision_status = 'disputed') = (dispute_case_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_phase1_fleet_statement_decisions_partner
  ON billing.phase1_fleet_statement_decisions(fleet_partner_id, period_month DESC);
