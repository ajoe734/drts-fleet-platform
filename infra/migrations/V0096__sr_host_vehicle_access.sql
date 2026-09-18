-- V0096__sr_host_vehicle_access.sql
-- Host vehicle ownership restricted read model and projections (SR-HOST-BE-001)
--
-- Wave: system-remediation-20260906
-- Domain: host_vehicle_access
-- Source Ref: feature-contracts.md §4, schema-allocation.json
-- Referenced Tables: reg.vehicles, reg.vehicle_contracts, core.partners,
--                    ops.phase1_maintenance_logs, crm.phase1_complaint_cases,
--                    ops.phase1_platform_earnings_ledger, ops.phase1_owned_orders

-- 1. Performance index for host vehicle ownership lookups
CREATE INDEX IF NOT EXISTS idx_reg_vehicles_owner_partner_id
  ON reg.vehicles(owner_partner_id);

-- 2. Primary projection view for host vehicles
-- Restricts visible fields, masks VIN (last 6 digits), and attaches operating fleet & contract period.
CREATE OR REPLACE VIEW ops.phase1_host_vehicle_projections AS
WITH latest_contracts AS (
  SELECT DISTINCT ON (vehicle_id)
    vehicle_id,
    start_at,
    end_at,
    status
  FROM reg.vehicle_contracts
  ORDER BY vehicle_id, start_at DESC
)
SELECT
  v.vehicle_id::text AS vehicle_id,
  v.owner_partner_id::text AS owner_partner_id,
  v.plate_no,
  CASE
    WHEN length(v.vin) > 6 THEN substr(v.vin, 1, length(v.vin) - 6) || '******'
    ELSE '******'
  END AS vin_masked,
  v.vehicle_form::text AS vehicle_form,
  v.license_class::text AS license_class,
  v.energy_type::text AS energy_type,
  v.current_status::text AS current_status,
  v.active_flag,
  COALESCE(dp.partner_name, '') AS operating_fleet_name,
  CASE
    WHEN lc.vehicle_id IS NOT NULL THEN
      jsonb_build_object(
        'startAt', lc.start_at,
        'endAt', lc.end_at,
        'status', lc.status
      )
    ELSE NULL
  END AS contract_period,
  v.created_at,
  v.updated_at
FROM reg.vehicles v
LEFT JOIN core.partners dp ON dp.partner_id = v.dispatch_partner_id
LEFT JOIN latest_contracts lc ON lc.vehicle_id = v.vehicle_id;

COMMENT ON VIEW ops.phase1_host_vehicle_projections IS
  'Host restricted vehicle projection read model with masked VIN, operating fleet, and contract period (SR-HOST-BE-001).';
