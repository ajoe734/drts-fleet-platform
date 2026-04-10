-- V0008__billing_and_settlement.sql

CREATE TABLE IF NOT EXISTS billing.driver_fee_plans (
  plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name varchar(200) NOT NULL,
  version_no varchar(50) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  calculation_method varchar(50) NOT NULL,
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  status varchar(30) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_name, version_no)
);

CREATE TABLE IF NOT EXISTS billing.driver_statements (
  statement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES reg.drivers(driver_id),
  period_month date NOT NULL,
  fee_plan_id uuid REFERENCES billing.driver_fee_plans(plan_id),
  gross_earning numeric(12,2) NOT NULL DEFAULT 0,
  service_fee numeric(12,2) NOT NULL DEFAULT 0,
  subsidy_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  receipt_no varchar(100),
  generated_at timestamptz,
  payout_status billing.statement_status_t NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period_month)
);

CREATE TABLE IF NOT EXISTS billing.driver_statement_lines (
  line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES billing.driver_statements(statement_id) ON DELETE CASCADE,
  line_type varchar(50) NOT NULL,
  ref_id uuid,
  description varchar(500),
  amount numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS billing.tenant_invoices (
  invoice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(tenant_id),
  invoice_no varchar(100) NOT NULL UNIQUE,
  period_from date NOT NULL,
  period_to date NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency_code varchar(10) NOT NULL DEFAULT 'TWD',
  status billing.invoice_status_t NOT NULL DEFAULT 'draft',
  pdf_file_id uuid,
  issued_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.invoice_lines (
  invoice_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing.tenant_invoices(invoice_id) ON DELETE CASCADE,
  order_id uuid REFERENCES ops.orders(order_id),
  description varchar(500) NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing.driver_reimbursement_batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  status billing.reimbursement_status_t NOT NULL DEFAULT 'draft',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing.driver_reimbursement_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES billing.driver_reimbursement_batches(batch_id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES reg.drivers(driver_id),
  order_id uuid REFERENCES ops.orders(order_id),
  reason_code varchar(50) NOT NULL,
  amount numeric(12,2) NOT NULL,
  proof_file_id uuid
);
