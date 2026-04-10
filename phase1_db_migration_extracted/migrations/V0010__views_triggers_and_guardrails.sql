-- V0010__views_triggers_and_guardrails.sql
-- Shared triggers, helper views and extra indexes

CREATE OR REPLACE FUNCTION admin.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'operating_areas'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_operating_areas'
    ) THEN
      DROP TRIGGER trg_touch_operating_areas ON core.operating_areas;
    END IF;
    CREATE TRIGGER trg_touch_operating_areas
    BEFORE UPDATE ON core.operating_areas
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'tenants'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_tenants'
    ) THEN
      DROP TRIGGER trg_touch_tenants ON core.tenants;
    END IF;
    CREATE TRIGGER trg_touch_tenants
    BEFORE UPDATE ON core.tenants
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'partners'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_partners'
    ) THEN
      DROP TRIGGER trg_touch_partners ON core.partners;
    END IF;
    CREATE TRIGGER trg_touch_partners
    BEFORE UPDATE ON core.partners
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'sites'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_sites'
    ) THEN
      DROP TRIGGER trg_touch_sites ON core.sites;
    END IF;
    CREATE TRIGGER trg_touch_sites
    BEFORE UPDATE ON core.sites
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'call_points'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_call_points'
    ) THEN
      DROP TRIGGER trg_touch_call_points ON core.call_points;
    END IF;
    CREATE TRIGGER trg_touch_call_points
    BEFORE UPDATE ON core.call_points
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'passengers'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_passengers'
    ) THEN
      DROP TRIGGER trg_touch_passengers ON core.passengers;
    END IF;
    CREATE TRIGGER trg_touch_passengers
    BEFORE UPDATE ON core.passengers
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'core'
      AND table_name = 'address_books'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_address_books'
    ) THEN
      DROP TRIGGER trg_touch_address_books ON core.address_books;
    END IF;
    CREATE TRIGGER trg_touch_address_books
    BEFORE UPDATE ON core.address_books
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'vehicles'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_vehicles'
    ) THEN
      DROP TRIGGER trg_touch_vehicles ON reg.vehicles;
    END IF;
    CREATE TRIGGER trg_touch_vehicles
    BEFORE UPDATE ON reg.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'vehicle_reg_profiles'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_vehicle_reg_profiles'
    ) THEN
      DROP TRIGGER trg_touch_vehicle_reg_profiles ON reg.vehicle_reg_profiles;
    END IF;
    CREATE TRIGGER trg_touch_vehicle_reg_profiles
    BEFORE UPDATE ON reg.vehicle_reg_profiles
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'vehicle_contracts'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_vehicle_contracts'
    ) THEN
      DROP TRIGGER trg_touch_vehicle_contracts ON reg.vehicle_contracts;
    END IF;
    CREATE TRIGGER trg_touch_vehicle_contracts
    BEFORE UPDATE ON reg.vehicle_contracts
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'insurance_policies'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_insurance_policies'
    ) THEN
      DROP TRIGGER trg_touch_insurance_policies ON reg.insurance_policies;
    END IF;
    CREATE TRIGGER trg_touch_insurance_policies
    BEFORE UPDATE ON reg.insurance_policies
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'dispatch_exclusivities'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_dispatch_exclusivities'
    ) THEN
      DROP TRIGGER trg_touch_dispatch_exclusivities ON reg.dispatch_exclusivities;
    END IF;
    CREATE TRIGGER trg_touch_dispatch_exclusivities
    BEFORE UPDATE ON reg.dispatch_exclusivities
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'drivers'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_drivers'
    ) THEN
      DROP TRIGGER trg_touch_drivers ON reg.drivers;
    END IF;
    CREATE TRIGGER trg_touch_drivers
    BEFORE UPDATE ON reg.drivers
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'reg'
      AND table_name = 'driver_reg_profiles'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_driver_reg_profiles'
    ) THEN
      DROP TRIGGER trg_touch_driver_reg_profiles ON reg.driver_reg_profiles;
    END IF;
    CREATE TRIGGER trg_touch_driver_reg_profiles
    BEFORE UPDATE ON reg.driver_reg_profiles
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'sla_templates'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_sla_templates'
    ) THEN
      DROP TRIGGER trg_touch_sla_templates ON ops.sla_templates;
    END IF;
    CREATE TRIGGER trg_touch_sla_templates
    BEFORE UPDATE ON ops.sla_templates
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'qualification_profiles'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_qualification_profiles'
    ) THEN
      DROP TRIGGER trg_touch_qualification_profiles ON ops.qualification_profiles;
    END IF;
    CREATE TRIGGER trg_touch_qualification_profiles
    BEFORE UPDATE ON ops.qualification_profiles
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'contract_rules'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_contract_rules'
    ) THEN
      DROP TRIGGER trg_touch_contract_rules ON ops.contract_rules;
    END IF;
    CREATE TRIGGER trg_touch_contract_rules
    BEFORE UPDATE ON ops.contract_rules
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'external_service_mappings'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_external_service_mappings'
    ) THEN
      DROP TRIGGER trg_touch_external_service_mappings ON ops.external_service_mappings;
    END IF;
    CREATE TRIGGER trg_touch_external_service_mappings
    BEFORE UPDATE ON ops.external_service_mappings
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'orders'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_orders'
    ) THEN
      DROP TRIGGER trg_touch_orders ON ops.orders;
    END IF;
    CREATE TRIGGER trg_touch_orders
    BEFORE UPDATE ON ops.orders
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'bookings'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_bookings'
    ) THEN
      DROP TRIGGER trg_touch_bookings ON ops.bookings;
    END IF;
    CREATE TRIGGER trg_touch_bookings
    BEFORE UPDATE ON ops.bookings
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'dispatch_jobs'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_dispatch_jobs'
    ) THEN
      DROP TRIGGER trg_touch_dispatch_jobs ON ops.dispatch_jobs;
    END IF;
    CREATE TRIGGER trg_touch_dispatch_jobs
    BEFORE UPDATE ON ops.dispatch_jobs
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'trips'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_trips'
    ) THEN
      DROP TRIGGER trg_touch_trips ON ops.trips;
    END IF;
    CREATE TRIGGER trg_touch_trips
    BEFORE UPDATE ON ops.trips
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'proof_bundles'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_proof_bundles'
    ) THEN
      DROP TRIGGER trg_touch_proof_bundles ON ops.proof_bundles;
    END IF;
    CREATE TRIGGER trg_touch_proof_bundles
    BEFORE UPDATE ON ops.proof_bundles
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'crm'
      AND table_name = 'complaint_cases'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_complaint_cases'
    ) THEN
      DROP TRIGGER trg_touch_complaint_cases ON crm.complaint_cases;
    END IF;
    CREATE TRIGGER trg_touch_complaint_cases
    BEFORE UPDATE ON crm.complaint_cases
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'billing'
      AND table_name = 'driver_fee_plans'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_driver_fee_plans'
    ) THEN
      DROP TRIGGER trg_touch_driver_fee_plans ON billing.driver_fee_plans;
    END IF;
    CREATE TRIGGER trg_touch_driver_fee_plans
    BEFORE UPDATE ON billing.driver_fee_plans
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'billing'
      AND table_name = 'driver_statements'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_driver_statements'
    ) THEN
      DROP TRIGGER trg_touch_driver_statements ON billing.driver_statements;
    END IF;
    CREATE TRIGGER trg_touch_driver_statements
    BEFORE UPDATE ON billing.driver_statements
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'billing'
      AND table_name = 'tenant_invoices'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_tenant_invoices'
    ) THEN
      DROP TRIGGER trg_touch_tenant_invoices ON billing.tenant_invoices;
    END IF;
    CREATE TRIGGER trg_touch_tenant_invoices
    BEFORE UPDATE ON billing.tenant_invoices
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'billing'
      AND table_name = 'driver_reimbursement_batches'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_driver_reimbursement_batches'
    ) THEN
      DROP TRIGGER trg_touch_driver_reimbursement_batches ON billing.driver_reimbursement_batches;
    END IF;
    CREATE TRIGGER trg_touch_driver_reimbursement_batches
    BEFORE UPDATE ON billing.driver_reimbursement_batches
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'public_info_versions'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_public_info_versions'
    ) THEN
      DROP TRIGGER trg_touch_public_info_versions ON admin.public_info_versions;
    END IF;
    CREATE TRIGGER trg_touch_public_info_versions
    BEFORE UPDATE ON admin.public_info_versions
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'placard_versions'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_placard_versions'
    ) THEN
      DROP TRIGGER trg_touch_placard_versions ON admin.placard_versions;
    END IF;
    CREATE TRIGGER trg_touch_placard_versions
    BEFORE UPDATE ON admin.placard_versions
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'webhook_endpoints'
      AND column_name = 'updated_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_touch_webhook_endpoints'
    ) THEN
      DROP TRIGGER trg_touch_webhook_endpoints ON admin.webhook_endpoints;
    END IF;
    CREATE TRIGGER trg_touch_webhook_endpoints
    BEFORE UPDATE ON admin.webhook_endpoints
    FOR EACH ROW
    EXECUTE FUNCTION admin.touch_updated_at();
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reg_insurance_policies_vehicle_end_at
  ON reg.insurance_policies(vehicle_id, end_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_vehicle_contracts_vehicle_start_at
  ON reg.vehicle_contracts(vehicle_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_drivers_bound_vehicle
  ON reg.drivers(bound_vehicle_id);

CREATE INDEX IF NOT EXISTS idx_crm_call_sessions_linked_order
  ON crm.call_sessions(linked_order_id);

CREATE INDEX IF NOT EXISTS idx_billing_driver_statements_driver_period
  ON billing.driver_statements(driver_id, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_admin_webhook_deliveries_webhook_time
  ON admin.webhook_deliveries(webhook_id, created_at DESC);

CREATE OR REPLACE VIEW reg.v_vehicle_dispatch_readiness AS
WITH latest_policy AS (
  SELECT DISTINCT ON (vehicle_id)
    vehicle_id,
    policy_no,
    status AS insurance_status,
    end_at AS insurance_end_at
  FROM reg.insurance_policies
  ORDER BY vehicle_id, end_at DESC
)
SELECT
  v.vehicle_id,
  v.plate_no,
  v.vin,
  v.current_status,
  vr.operating_area_id,
  vr.dispatchable_flag,
  vr.latest_review_status,
  COALESCE(de.review_status, 'draft'::reg.review_status_t) AS exclusivity_review_status,
  lp.policy_no,
  lp.insurance_status,
  lp.insurance_end_at,
  (
    vr.dispatchable_flag = true
    AND vr.latest_review_status = 'approved'
    AND COALESCE(de.review_status, 'draft'::reg.review_status_t) = 'approved'
    AND lp.vehicle_id IS NOT NULL
    AND lp.insurance_status = 'active'
    AND lp.insurance_end_at::date >= current_date
    AND v.current_status = 'active'
  ) AS dispatch_ready,
  array_remove(ARRAY[
    CASE WHEN vr.dispatchable_flag IS NOT TRUE THEN 'dispatchable_false' END,
    CASE WHEN vr.latest_review_status <> 'approved' THEN 'review_not_approved' END,
    CASE WHEN COALESCE(de.review_status, 'draft'::reg.review_status_t) <> 'approved' THEN 'exclusivity_not_approved' END,
    CASE WHEN lp.vehicle_id IS NULL THEN 'insurance_missing' END,
    CASE WHEN lp.insurance_status IS NOT NULL AND lp.insurance_status <> 'active' THEN 'insurance_not_active' END,
    CASE WHEN lp.insurance_end_at IS NOT NULL AND lp.insurance_end_at::date < current_date THEN 'insurance_expired' END,
    CASE WHEN v.current_status <> 'active' THEN 'vehicle_not_active' END
  ], NULL) AS blocking_reasons
FROM reg.vehicles v
JOIN reg.vehicle_reg_profiles vr ON vr.vehicle_id = v.vehicle_id
LEFT JOIN reg.dispatch_exclusivities de ON de.vehicle_id = v.vehicle_id
LEFT JOIN latest_policy lp ON lp.vehicle_id = v.vehicle_id;

CREATE OR REPLACE VIEW ops.v_dispatch_board_pending AS
SELECT
  dj.dispatch_job_id,
  dj.status AS dispatch_job_status,
  dj.dispatch_mode,
  dj.priority_score,
  dj.service_area_check_result,
  o.order_id,
  o.order_no,
  o.order_source,
  o.service_bucket,
  o.current_status AS order_status,
  o.scheduled_at,
  o.pickup_address,
  o.pickup_lat,
  o.pickup_lng,
  o.dropoff_address,
  t.tenant_code,
  t.tenant_name,
  p.full_name AS passenger_name,
  p.department_name,
  EXTRACT(EPOCH FROM (now() - o.created_at))::integer / 60 AS waiting_minutes
FROM ops.dispatch_jobs dj
JOIN ops.orders o ON o.order_id = dj.order_id
LEFT JOIN core.tenants t ON t.tenant_id = o.tenant_id
LEFT JOIN core.passengers p ON p.passenger_id = o.passenger_id
WHERE dj.status IN ('pending', 'matching', 'reserved', 'queued', 'redispatching');

CREATE OR REPLACE VIEW crm.v_complaint_export AS
SELECT
  c.case_no,
  c.case_source,
  c.category,
  c.severity,
  c.received_at,
  c.sla_due_at,
  c.status,
  c.resolution_code,
  c.closed_at,
  o.order_no,
  o.order_source,
  o.service_bucket,
  o.pickup_address,
  o.dropoff_address,
  cs.call_id,
  cs.caller_phone,
  cs.recording_id
FROM crm.complaint_cases c
LEFT JOIN ops.orders o ON o.order_id = c.related_order_id
LEFT JOIN crm.call_sessions cs ON cs.call_id = c.related_call_id;

CREATE OR REPLACE VIEW admin.v_filing_vehicle_roster AS
SELECT
  v.plate_no,
  v.vin,
  v.vehicle_form,
  v.license_class,
  v.energy_type,
  oa.area_code,
  oa.area_name,
  vr.dispatchable_flag,
  vr.latest_review_status,
  de.review_status AS exclusivity_review_status
FROM reg.vehicles v
JOIN reg.vehicle_reg_profiles vr ON vr.vehicle_id = v.vehicle_id
LEFT JOIN reg.dispatch_exclusivities de ON de.vehicle_id = v.vehicle_id
LEFT JOIN core.operating_areas oa ON oa.area_id = vr.operating_area_id;
