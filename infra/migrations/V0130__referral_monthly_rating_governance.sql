-- BUREAU-R04-MONTHLY-RATING-COACHING-20261024
-- Monthly driver rating governance: coaching (< 4.0) and termination review (3 consecutive months < 3.5).

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE TABLE IF NOT EXISTS reporting.referral_monthly_rating_governance_records (
  record_id text PRIMARY KEY,
  driver_id text NOT NULL,
  period_month text NOT NULL
    CHECK (period_month ~ '^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$'),
  rule_type text NOT NULL
    CHECK (rule_type IN ('coaching', 'termination_review')),
  threshold numeric(4,2) NOT NULL
    CHECK (
      (rule_type = 'coaching' AND threshold = 4.00)
      OR (rule_type = 'termination_review' AND threshold = 3.50)
    ),
  average_rating numeric(4,2) NOT NULL
    CHECK (average_rating >= 1.00 AND average_rating <= 5.00),
  rating_count integer NOT NULL
    CHECK (rating_count >= 1),
  consecutive_low_months integer NOT NULL
    CHECK (
      (rule_type = 'coaching' AND consecutive_low_months >= 0)
      OR (rule_type = 'termination_review' AND consecutive_low_months >= 3)
    ),
  triggered_months jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(triggered_months) = 'array' AND jsonb_array_length(triggered_months) >= 1),
  monthly_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(monthly_breakdown) = 'array'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'coached', 'terminated', 'dismissed')),
  outcome text NULL
    CHECK (outcome IS NULL OR outcome IN ('coached', 'terminated', 'dismissed')),
  outcome_reason text NULL,
  handled_by_actor_id text NULL,
  handled_at timestamptz NULL,
  audit_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (driver_id, period_month, rule_type),
  CHECK (
    (
      status = 'pending'
      AND outcome IS NULL
      AND outcome_reason IS NULL
      AND handled_by_actor_id IS NULL
      AND handled_at IS NULL
    )
    OR (
      status = outcome
      AND outcome IS NOT NULL
      AND outcome_reason IS NOT NULL
      AND btrim(outcome_reason) <> ''
      AND handled_by_actor_id IS NOT NULL
      AND btrim(handled_by_actor_id) <> ''
      AND handled_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_referral_monthly_rating_governance_period
  ON reporting.referral_monthly_rating_governance_records(period_month DESC, driver_id ASC, rule_type ASC);
