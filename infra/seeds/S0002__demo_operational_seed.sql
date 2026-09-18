-- S0002__demo_operational_seed.sql
-- Demo tenant / partner / fleet / order / dispatch / complaint / billing data

-- tenants
INSERT INTO core.tenants (
  tenant_id, tenant_code, tenant_name, tenant_type, status, brand_name, default_area_id
)
VALUES
  ('10000000-0000-0000-0000-000000000201', 'TEN_ACME', 'Acme Enterprise', 'enterprise', 'active', 'Acme', '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000202', 'TEN_PREMIUMCARD', 'Premium Card Concierge', 'credit_card', 'active', 'PremiumCard', '00000000-0000-0000-0000-000000000102')
ON CONFLICT (tenant_code) DO UPDATE
SET tenant_name = EXCLUDED.tenant_name,
    tenant_type = EXCLUDED.tenant_type,
    status = EXCLUDED.status,
    brand_name = EXCLUDED.brand_name,
    default_area_id = EXCLUDED.default_area_id,
    updated_at = now();

-- partners
INSERT INTO core.partners (
  partner_id, partner_code, partner_name, partner_type, tenant_id, area_id, contact_name, contact_email, contact_phone, status
)
VALUES
  ('10000000-0000-0000-0000-000000000301', 'PARTNER_ACME', 'Acme Enterprise Partner', 'enterprise_partner', '10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', '總務窗口', 'fleet-admin@acme.example', '02-2700-0001', 'active'),
  ('10000000-0000-0000-0000-000000000302', 'PARTNER_PREMIUM', 'Premium Card Partner', 'credit_card_partner', '10000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', '禮賓窗口', 'concierge@premium.example', '03-390-0001', 'active'),
  ('10000000-0000-0000-0000-000000000303', 'PARTNER_CITYOPCO', 'City Dispatch Operator', 'dispatch_partner', NULL, '00000000-0000-0000-0000-000000000101', '營運中心', 'ops@citydispatch.example', '02-2700-9999', 'active'),
  ('10000000-0000-0000-0000-000000000304', 'PARTNER_JOHN_OWNER', 'John Individual Owner', 'individual_owner', NULL, '00000000-0000-0000-0000-000000000101', 'John Owner', 'owner1@example', '0912-000-001', 'active'),
  ('10000000-0000-0000-0000-000000000305', 'PARTNER_BIZ_FLEET', 'Business Fleet Partner', 'fleet_company_partner', NULL, '00000000-0000-0000-0000-000000000102', 'Fleet Desk', 'fleet@example', '0912-000-002', 'active')
ON CONFLICT (partner_code) DO UPDATE
SET partner_name = EXCLUDED.partner_name,
    partner_type = EXCLUDED.partner_type,
    tenant_id = EXCLUDED.tenant_id,
    area_id = EXCLUDED.area_id,
    contact_name = EXCLUDED.contact_name,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    status = EXCLUDED.status,
    updated_at = now();

-- sites and call points
INSERT INTO core.sites (
  site_id, tenant_id, site_code, site_name, area_id, address_text, lat, lng, contact_name, contact_phone
)
VALUES
  ('10000000-0000-0000-0000-000000000311', '10000000-0000-0000-0000-000000000201', 'ACME_HQ', 'Acme 總部', '00000000-0000-0000-0000-000000000101', '台北市信義區市府路 1 號', 25.0375000, 121.5637000, '總務窗口', '02-2700-0001'),
  ('10000000-0000-0000-0000-000000000312', '10000000-0000-0000-0000-000000000202', 'TPE_AIRPORT_LOUNGE', '桃園機場禮賓櫃台', '00000000-0000-0000-0000-000000000102', '桃園市大園區航站南路 9 號', 25.0797000, 121.2342000, '禮賓窗口', '03-390-0001')
ON CONFLICT (tenant_id, site_code) DO UPDATE
SET site_name = EXCLUDED.site_name,
    area_id = EXCLUDED.area_id,
    address_text = EXCLUDED.address_text,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    updated_at = now();

INSERT INTO core.call_points (
  call_point_id, site_id, point_code, point_name, point_type, address_text, lat, lng, active_flag
)
VALUES
  ('10000000-0000-0000-0000-000000000321', '10000000-0000-0000-0000-000000000311', 'ACME_RECEPTION', 'Acme 一樓櫃檯', 'concierge', '台北市信義區市府路 1 號 1F', 25.0375000, 121.5637000, true),
  ('10000000-0000-0000-0000-000000000322', '10000000-0000-0000-0000-000000000312', 'TPE_L1', 'T1 禮賓接送點', 'concierge', '桃園機場第一航廈 1F', 25.0797000, 121.2342000, true)
ON CONFLICT (site_id, point_code) DO UPDATE
SET point_name = EXCLUDED.point_name,
    point_type = EXCLUDED.point_type,
    address_text = EXCLUDED.address_text,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    active_flag = EXCLUDED.active_flag,
    updated_at = now();

-- passengers
INSERT INTO core.passengers (
  passenger_id, tenant_id, full_name, employee_no, department_name, mobile, email, active_flag
)
VALUES
  ('10000000-0000-0000-0000-000000000331', '10000000-0000-0000-0000-000000000201', '王小美', 'E1001', '總務部', '0911-000-001', 'xiaomei.wang@acme.example', true),
  ('10000000-0000-0000-0000-000000000332', '10000000-0000-0000-0000-000000000201', '陳大文', 'E1002', '業務部', '0911-000-002', 'dawen.chen@acme.example', true),
  ('10000000-0000-0000-0000-000000000333', '10000000-0000-0000-0000-000000000202', '林貴賓', 'CARD001', '禮賓會員', '0911-000-003', 'vip.lin@premium.example', true),
  ('10000000-0000-0000-0000-000000000334', NULL, '林小姐', NULL, NULL, '0911-000-004', NULL, true)
ON CONFLICT (passenger_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name,
    employee_no = EXCLUDED.employee_no,
    department_name = EXCLUDED.department_name,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    active_flag = EXCLUDED.active_flag,
    updated_at = now();

-- addresses
INSERT INTO core.address_books (
  address_id, tenant_id, owner_passenger_id, address_name, address_text, lat, lng, tags, active_flag
)
VALUES
  ('10000000-0000-0000-0000-000000000341', '10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000331', 'Acme HQ', '台北市信義區市府路 1 號', 25.0375000, 121.5637000, ARRAY['office'], true),
  ('10000000-0000-0000-0000-000000000342', '10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000333', 'T1 Pickup', '桃園市大園區航站南路 9 號', 25.0797000, 121.2342000, ARRAY['airport','pickup'], true)
ON CONFLICT (address_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    owner_passenger_id = EXCLUDED.owner_passenger_id,
    address_name = EXCLUDED.address_name,
    address_text = EXCLUDED.address_text,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    tags = EXCLUDED.tags,
    active_flag = EXCLUDED.active_flag,
    updated_at = now();

-- vehicles
INSERT INTO reg.vehicles (
  vehicle_id, plate_no, vin, vehicle_form, license_class, energy_type,
  owner_type, owner_partner_id, dispatch_partner_id, current_status, active_flag
)
VALUES
  ('10000000-0000-0000-0000-000000000351', 'ABC-1234', 'VIN00000000000000001', 'sedan', 'taxi', 'fuel', 'individual_owner', '10000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000303', 'active', true),
  ('10000000-0000-0000-0000-000000000352', 'ABC-2234', 'VIN00000000000000002', 'sedan', 'taxi', 'ev', 'individual_owner', '10000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000303', 'active', true),
  ('10000000-0000-0000-0000-000000000353', 'BCD-7788', 'VIN00000000000000003', 'mpv', 'rental', 'hybrid', 'fleet_company_partner', '10000000-0000-0000-0000-000000000305', '10000000-0000-0000-0000-000000000303', 'active', true)
ON CONFLICT (plate_no) DO UPDATE
SET vin = EXCLUDED.vin,
    vehicle_form = EXCLUDED.vehicle_form,
    license_class = EXCLUDED.license_class,
    energy_type = EXCLUDED.energy_type,
    owner_type = EXCLUDED.owner_type,
    owner_partner_id = EXCLUDED.owner_partner_id,
    dispatch_partner_id = EXCLUDED.dispatch_partner_id,
    current_status = EXCLUDED.current_status,
    active_flag = EXCLUDED.active_flag,
    updated_at = now();

INSERT INTO reg.vehicle_reg_profiles (
  vehicle_id, operating_area_id, dispatchable_flag, brand_profile_id, placard_version_id,
  contract_start, contract_end, service_tags, latest_review_status, notes, updated_at
)
VALUES
  ('10000000-0000-0000-0000-000000000351', '00000000-0000-0000-0000-000000000101', true, NULL, '00000000-0000-0000-0000-000000000402', now() - interval '90 day', now() + interval '275 day', ARRAY['standard'], 'approved', 'standard taxi ready', now()),
  ('10000000-0000-0000-0000-000000000352', '00000000-0000-0000-0000-000000000101', true, NULL, '00000000-0000-0000-0000-000000000402', now() - interval '60 day', now() + interval '305 day', ARRAY['standard','ev'], 'approved', 'ev taxi ready', now()),
  ('10000000-0000-0000-0000-000000000353', '00000000-0000-0000-0000-000000000102', true, NULL, '00000000-0000-0000-0000-000000000402', now() - interval '120 day', now() + interval '245 day', ARRAY['vip','airport','luggage'], 'approved', 'airport mpv ready', now())
ON CONFLICT (vehicle_id) DO UPDATE
SET operating_area_id = EXCLUDED.operating_area_id,
    dispatchable_flag = EXCLUDED.dispatchable_flag,
    placard_version_id = EXCLUDED.placard_version_id,
    contract_start = EXCLUDED.contract_start,
    contract_end = EXCLUDED.contract_end,
    service_tags = EXCLUDED.service_tags,
    latest_review_status = EXCLUDED.latest_review_status,
    notes = EXCLUDED.notes,
    updated_at = now();

INSERT INTO reg.vehicle_contracts (
  contract_id, vehicle_id, partner_id, partner_type, contract_type, operating_area_id, service_scope,
  start_at, end_at, status, approved_at
)
VALUES
  ('10000000-0000-0000-0000-000000000361', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000304', 'individual_owner', 'dispatch_delegate', '00000000-0000-0000-0000-000000000101', 'standard_taxi', now() - interval '90 day', now() + interval '275 day', 'active', now() - interval '90 day'),
  ('10000000-0000-0000-0000-000000000362', '10000000-0000-0000-0000-000000000352', '10000000-0000-0000-0000-000000000304', 'individual_owner', 'dispatch_delegate', '00000000-0000-0000-0000-000000000101', 'standard_taxi', now() - interval '60 day', now() + interval '305 day', 'active', now() - interval '60 day'),
  ('10000000-0000-0000-0000-000000000363', '10000000-0000-0000-0000-000000000353', '10000000-0000-0000-0000-000000000305', 'fleet_company_partner', 'service_fleet_contract', '00000000-0000-0000-0000-000000000102', 'business_dispatch', now() - interval '120 day', now() + interval '245 day', 'active', now() - interval '120 day')
ON CONFLICT (contract_id) DO UPDATE
SET vehicle_id = EXCLUDED.vehicle_id,
    partner_id = EXCLUDED.partner_id,
    partner_type = EXCLUDED.partner_type,
    contract_type = EXCLUDED.contract_type,
    operating_area_id = EXCLUDED.operating_area_id,
    service_scope = EXCLUDED.service_scope,
    start_at = EXCLUDED.start_at,
    end_at = EXCLUDED.end_at,
    status = EXCLUDED.status,
    approved_at = EXCLUDED.approved_at,
    updated_at = now();

INSERT INTO reg.insurance_policies (
  policy_id, vehicle_id, policy_no, insurance_type, insurer_name, coverage_amount,
  start_at, end_at, status
)
VALUES
  ('10000000-0000-0000-0000-000000000371', '10000000-0000-0000-0000-000000000351', 'POL-TAXI-0001', 'passenger_liability', 'Demo Insurance', 3000000, now() - interval '90 day', now() + interval '275 day', 'active'),
  ('10000000-0000-0000-0000-000000000372', '10000000-0000-0000-0000-000000000352', 'POL-TAXI-0002', 'passenger_liability', 'Demo Insurance', 3000000, now() - interval '60 day', now() + interval '305 day', 'active'),
  ('10000000-0000-0000-0000-000000000373', '10000000-0000-0000-0000-000000000353', 'POL-BIZ-0001', 'passenger_liability', 'Demo Insurance', 5000000, now() - interval '120 day', now() + interval '245 day', 'active')
ON CONFLICT (policy_id) DO UPDATE
SET vehicle_id = EXCLUDED.vehicle_id,
    policy_no = EXCLUDED.policy_no,
    insurance_type = EXCLUDED.insurance_type,
    insurer_name = EXCLUDED.insurer_name,
    coverage_amount = EXCLUDED.coverage_amount,
    start_at = EXCLUDED.start_at,
    end_at = EXCLUDED.end_at,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO reg.dispatch_exclusivities (
  vehicle_id, declaration_status, review_status, reviewer_id, reviewed_at, exclusive_provider_name, effective_start, effective_end
)
VALUES
  ('10000000-0000-0000-0000-000000000351', 'submitted', 'approved', NULL, now() - interval '89 day', 'City Dispatch Operator', now() - interval '90 day', now() + interval '275 day'),
  ('10000000-0000-0000-0000-000000000352', 'submitted', 'approved', NULL, now() - interval '59 day', 'City Dispatch Operator', now() - interval '60 day', now() + interval '305 day'),
  ('10000000-0000-0000-0000-000000000353', 'submitted', 'approved', NULL, now() - interval '119 day', 'City Dispatch Operator', now() - interval '120 day', now() + interval '245 day')
ON CONFLICT (vehicle_id) DO UPDATE
SET declaration_status = EXCLUDED.declaration_status,
    review_status = EXCLUDED.review_status,
    reviewer_id = EXCLUDED.reviewer_id,
    reviewed_at = EXCLUDED.reviewed_at,
    exclusive_provider_name = EXCLUDED.exclusive_provider_name,
    effective_start = EXCLUDED.effective_start,
    effective_end = EXCLUDED.effective_end,
    updated_at = now();

-- drivers
INSERT INTO reg.drivers (
  driver_id, full_name, mobile, bound_vehicle_id, status, service_rating, complaint_count
)
VALUES
  ('10000000-0000-0000-0000-000000000381', '張司機', '0920-000-001', '10000000-0000-0000-0000-000000000351', 'active', 4.85, 0),
  ('10000000-0000-0000-0000-000000000382', '李司機', '0920-000-002', '10000000-0000-0000-0000-000000000352', 'active', 4.90, 0),
  ('10000000-0000-0000-0000-000000000383', '王司機', '0920-000-003', '10000000-0000-0000-0000-000000000353', 'active', 4.95, 0)
ON CONFLICT (driver_id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    mobile = EXCLUDED.mobile,
    bound_vehicle_id = EXCLUDED.bound_vehicle_id,
    status = EXCLUDED.status,
    service_rating = EXCLUDED.service_rating,
    complaint_count = EXCLUDED.complaint_count,
    updated_at = now();

INSERT INTO reg.driver_reg_profiles (
  driver_id, occupational_license_no, occupational_license_expiry, taxi_registration_no,
  taxi_registration_expiry, training_status, last_training_at, certificate_status, updated_at
)
VALUES
  ('10000000-0000-0000-0000-000000000381', 'OCC-TAXI-0001', current_date + 365, 'REG-TAXI-0001', current_date + 365, 'passed', now() - interval '30 day', 'valid', now()),
  ('10000000-0000-0000-0000-000000000382', 'OCC-TAXI-0002', current_date + 365, 'REG-TAXI-0002', current_date + 365, 'passed', now() - interval '45 day', 'valid', now()),
  ('10000000-0000-0000-0000-000000000383', 'OCC-BIZ-0001', current_date + 365, 'REG-BIZ-0001', current_date + 365, 'passed', now() - interval '20 day', 'valid', now())
ON CONFLICT (driver_id) DO UPDATE
SET occupational_license_no = EXCLUDED.occupational_license_no,
    occupational_license_expiry = EXCLUDED.occupational_license_expiry,
    taxi_registration_no = EXCLUDED.taxi_registration_no,
    taxi_registration_expiry = EXCLUDED.taxi_registration_expiry,
    training_status = EXCLUDED.training_status,
    last_training_at = EXCLUDED.last_training_at,
    certificate_status = EXCLUDED.certificate_status,
    updated_at = now();

INSERT INTO reg.driver_training_records (
  training_record_id, driver_id, course_name, course_type, completed_at, expires_at, result
)
VALUES
  ('10000000-0000-0000-0000-000000000391', '10000000-0000-0000-0000-000000000381', '服務品質與申訴應對', 'service_quality', now() - interval '30 day', now() + interval '335 day', 'passed'),
  ('10000000-0000-0000-0000-000000000392', '10000000-0000-0000-0000-000000000382', '服務品質與申訴應對', 'service_quality', now() - interval '45 day', now() + interval '320 day', 'passed'),
  ('10000000-0000-0000-0000-000000000393', '10000000-0000-0000-0000-000000000383', '商務派車禮儀', 'business_dispatch', now() - interval '20 day', now() + interval '345 day', 'passed')
ON CONFLICT (training_record_id) DO UPDATE
SET driver_id = EXCLUDED.driver_id,
    course_name = EXCLUDED.course_name,
    course_type = EXCLUDED.course_type,
    completed_at = EXCLUDED.completed_at,
    expires_at = EXCLUDED.expires_at,
    result = EXCLUDED.result;

-- contract rules
INSERT INTO ops.contract_rules (
  contract_rule_id, rule_code, tenant_id, partner_id, service_bucket, sla_template_id, qualification_profile_id,
  pricing_template_id, split_template_id, fallback_policy_id, allows_change_passenger,
  allows_assign_specific_driver, allows_assign_specific_vehicle, active_flag, settings
)
VALUES
  (
    '10000000-0000-0000-0000-000000000401',
    'CR_STD_DEFAULT',
    NULL,
    NULL,
    'standard_taxi',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000511',
    NULL, NULL, NULL,
    false, false, false, true,
    '{"pricing_mode":"metered"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000402',
    'CR_ENTERPRISE_ACME',
    '10000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000301',
    'business_dispatch',
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000512',
    NULL, NULL, NULL,
    true, false, true, true,
    '{"pricing_mode":"contract", "requires_signoff": true, "cost_center_required": true}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000403',
    'CR_AIRPORT_PREMIUM',
    '10000000-0000-0000-0000-000000000202',
    '10000000-0000-0000-0000-000000000302',
    'business_dispatch',
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000513',
    NULL, NULL, NULL,
    false, false, false, true,
    '{"pricing_mode":"partner_benefit", "requires_expense_proof": true, "flight_tracking": true}'::jsonb
  )
ON CONFLICT (rule_code) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    partner_id = EXCLUDED.partner_id,
    service_bucket = EXCLUDED.service_bucket,
    sla_template_id = EXCLUDED.sla_template_id,
    qualification_profile_id = EXCLUDED.qualification_profile_id,
    allows_change_passenger = EXCLUDED.allows_change_passenger,
    allows_assign_specific_driver = EXCLUDED.allows_assign_specific_driver,
    allows_assign_specific_vehicle = EXCLUDED.allows_assign_specific_vehicle,
    active_flag = EXCLUDED.active_flag,
    settings = EXCLUDED.settings,
    updated_at = now();

-- API key + webhook demo
INSERT INTO admin.api_keys (
  api_key_id, tenant_id, key_name, key_prefix, key_hash, scopes, expires_at
)
VALUES
  ('10000000-0000-0000-0000-000000000411', '10000000-0000-0000-0000-000000000201', 'Acme Integration Key', 'acme_live_', 'sha256:demo-acme-key', ARRAY['tenant:bookings:write','tenant:reports:read'], now() + interval '365 day')
ON CONFLICT (api_key_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    key_name = EXCLUDED.key_name,
    key_prefix = EXCLUDED.key_prefix,
    key_hash = EXCLUDED.key_hash,
    scopes = EXCLUDED.scopes,
    expires_at = EXCLUDED.expires_at;

INSERT INTO admin.webhook_endpoints (
  webhook_id, tenant_id, name, target_url, secret_hash, events, active_flag
)
VALUES
  ('10000000-0000-0000-0000-000000000412', '10000000-0000-0000-0000-000000000201', 'Acme Order Webhook', 'https://acme.example/webhooks/orders', 'sha256:demo-webhook-secret', ARRAY['order.created','dispatch.assigned','trip.completed'], true)
ON CONFLICT (webhook_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    target_url = EXCLUDED.target_url,
    secret_hash = EXCLUDED.secret_hash,
    events = EXCLUDED.events,
    active_flag = EXCLUDED.active_flag,
    updated_at = now();

-- order 1: standard taxi app order in progress
INSERT INTO ops.orders (
  order_id, order_no, order_domain, order_source, service_bucket, dispatch_semantics,
  source_partner_id, tenant_id, passenger_id, operating_area_id,
  pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  scheduled_at, contract_rule_id, sla_template_id, qualification_profile_id,
  current_status, external_ref_no, metadata
)
VALUES
  (
    '10000000-0000-0000-0000-000000000421',
    'ORD-STD-0001',
    'owned',
    'app',
    'standard_taxi',
    'realtime',
    NULL,
    NULL,
    '10000000-0000-0000-0000-000000000334',
    '00000000-0000-0000-0000-000000000101',
    '台北市信義區市府路 45 號',
    25.0401000, 121.5671000,
    '台北市中山區南京東路三段 100 號',
    25.0520000, 121.5420000,
    now() - interval '20 minute',
    '10000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000511',
    'trip_in_progress',
    NULL,
    '{"channel":"retail_app"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000422',
    'ORD-BIZ-0001',
    'owned',
    'api',
    'business_dispatch',
    'reservation',
    '10000000-0000-0000-0000-000000000301',
    '10000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000331',
    '00000000-0000-0000-0000-000000000101',
    '台北市信義區市府路 1 號',
    25.0375000, 121.5637000,
    '桃園市大園區航站南路 9 號',
    25.0797000, 121.2342000,
    now() + interval '1 day',
    '10000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000512',
    'preassigned',
    'ACME-BK-0001',
    '{"cost_center":"CC-ACME-01"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000423',
    'ORD-PHONE-0001',
    'owned',
    'phone',
    'standard_taxi',
    'realtime',
    NULL,
    NULL,
    '10000000-0000-0000-0000-000000000334',
    '00000000-0000-0000-0000-000000000101',
    '台北市中山區建國北路 88 號',
    25.0565000, 121.5360000,
    '台北市大安區敦化南路二段 20 號',
    25.0285000, 121.5490000,
    now() - interval '3 day',
    '10000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000511',
    'completed',
    NULL,
    '{"channel":"call_center"}'::jsonb
  )
ON CONFLICT (order_no) DO UPDATE
SET order_domain = EXCLUDED.order_domain,
    order_source = EXCLUDED.order_source,
    service_bucket = EXCLUDED.service_bucket,
    dispatch_semantics = EXCLUDED.dispatch_semantics,
    source_partner_id = EXCLUDED.source_partner_id,
    tenant_id = EXCLUDED.tenant_id,
    passenger_id = EXCLUDED.passenger_id,
    operating_area_id = EXCLUDED.operating_area_id,
    pickup_address = EXCLUDED.pickup_address,
    pickup_lat = EXCLUDED.pickup_lat,
    pickup_lng = EXCLUDED.pickup_lng,
    dropoff_address = EXCLUDED.dropoff_address,
    dropoff_lat = EXCLUDED.dropoff_lat,
    dropoff_lng = EXCLUDED.dropoff_lng,
    scheduled_at = EXCLUDED.scheduled_at,
    contract_rule_id = EXCLUDED.contract_rule_id,
    sla_template_id = EXCLUDED.sla_template_id,
    qualification_profile_id = EXCLUDED.qualification_profile_id,
    current_status = EXCLUDED.current_status,
    external_ref_no = EXCLUDED.external_ref_no,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO ops.bookings (
  booking_id, order_id, booking_type, reservation_window_start, reservation_window_end, modifiable_until, cancelable_until
)
VALUES
  (
    '10000000-0000-0000-0000-000000000431',
    '10000000-0000-0000-0000-000000000422',
    'oneway',
    date_trunc('hour', now() + interval '1 day'),
    date_trunc('hour', now() + interval '1 day') + interval '30 minute',
    now() + interval '18 hour',
    now() + interval '18 hour'
  )
ON CONFLICT (order_id) DO UPDATE
SET booking_type = EXCLUDED.booking_type,
    reservation_window_start = EXCLUDED.reservation_window_start,
    reservation_window_end = EXCLUDED.reservation_window_end,
    modifiable_until = EXCLUDED.modifiable_until,
    cancelable_until = EXCLUDED.cancelable_until,
    updated_at = now();

INSERT INTO ops.dispatch_jobs (
  dispatch_job_id, order_id, dispatch_mode, status, priority_score, service_area_check_result, last_attempt_at
)
VALUES
  ('10000000-0000-0000-0000-000000000441', '10000000-0000-0000-0000-000000000421', 'realtime', 'accepted', 90, 'passed', now() - interval '18 minute'),
  ('10000000-0000-0000-0000-000000000442', '10000000-0000-0000-0000-000000000422', 'reservation', 'reserved', 100, 'passed', now() - interval '10 minute'),
  ('10000000-0000-0000-0000-000000000443', '10000000-0000-0000-0000-000000000423', 'realtime', 'closed', 80, 'passed', now() - interval '3 day')
ON CONFLICT (order_id) DO UPDATE
SET dispatch_mode = EXCLUDED.dispatch_mode,
    status = EXCLUDED.status,
    priority_score = EXCLUDED.priority_score,
    service_area_check_result = EXCLUDED.service_area_check_result,
    last_attempt_at = EXCLUDED.last_attempt_at,
    updated_at = now();

INSERT INTO ops.dispatch_attempts (
  attempt_id, dispatch_job_id, attempt_no, attempt_mode, candidate_vehicle_id, candidate_driver_id,
  offered_at, accepted_at, failed_reason, status, metadata
)
VALUES
  ('10000000-0000-0000-0000-000000000451', '10000000-0000-0000-0000-000000000441', 1, 'realtime', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000381', now() - interval '19 minute', now() - interval '18 minute', NULL, 'accepted', '{"eta_minutes":6}'::jsonb),
  ('10000000-0000-0000-0000-000000000452', '10000000-0000-0000-0000-000000000442', 1, 'reservation', '10000000-0000-0000-0000-000000000353', '10000000-0000-0000-0000-000000000383', now() - interval '10 minute', now() - interval '9 minute', NULL, 'accepted', '{"eta_minutes":0}'::jsonb),
  ('10000000-0000-0000-0000-000000000453', '10000000-0000-0000-0000-000000000443', 1, 'realtime', '10000000-0000-0000-0000-000000000352', '10000000-0000-0000-0000-000000000382', now() - interval '3 day 30 minute', now() - interval '3 day 28 minute', NULL, 'accepted', '{"eta_minutes":4}'::jsonb)
ON CONFLICT (dispatch_job_id, attempt_no) DO UPDATE
SET attempt_mode = EXCLUDED.attempt_mode,
    candidate_vehicle_id = EXCLUDED.candidate_vehicle_id,
    candidate_driver_id = EXCLUDED.candidate_driver_id,
    offered_at = EXCLUDED.offered_at,
    accepted_at = EXCLUDED.accepted_at,
    failed_reason = EXCLUDED.failed_reason,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata;

INSERT INTO ops.dispatch_assignments (
  assignment_id, dispatch_job_id, vehicle_id, driver_id, assigned_at, accepted_at,
  arrived_pickup_at, trip_started_at, completed_at, status, version_no
)
VALUES
  ('10000000-0000-0000-0000-000000000461', '10000000-0000-0000-0000-000000000441', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000381', now() - interval '18 minute', now() - interval '18 minute', now() - interval '8 minute', now() - interval '6 minute', NULL, 'started', 1),
  ('10000000-0000-0000-0000-000000000462', '10000000-0000-0000-0000-000000000442', '10000000-0000-0000-0000-000000000353', '10000000-0000-0000-0000-000000000383', now() - interval '9 minute', now() - interval '9 minute', NULL, NULL, NULL, 'reserved', 1),
  ('10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000443', '10000000-0000-0000-0000-000000000352', '10000000-0000-0000-0000-000000000382', now() - interval '3 day 28 minute', now() - interval '3 day 28 minute', now() - interval '3 day 20 minute', now() - interval '3 day 18 minute', now() - interval '3 day 2 minute', 'completed', 1)
ON CONFLICT (dispatch_job_id, version_no) DO UPDATE
SET vehicle_id = EXCLUDED.vehicle_id,
    driver_id = EXCLUDED.driver_id,
    assigned_at = EXCLUDED.assigned_at,
    accepted_at = EXCLUDED.accepted_at,
    arrived_pickup_at = EXCLUDED.arrived_pickup_at,
    trip_started_at = EXCLUDED.trip_started_at,
    completed_at = EXCLUDED.completed_at,
    status = EXCLUDED.status;

INSERT INTO ops.trips (
  trip_id, order_id, assignment_id, vehicle_id, driver_id, trip_status,
  started_at, completed_at, actual_distance_km, actual_duration_sec,
  proof_required, proof_status, metadata
)
VALUES
  ('10000000-0000-0000-0000-000000000471', '10000000-0000-0000-0000-000000000421', '10000000-0000-0000-0000-000000000461', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000381', 'in_progress', now() - interval '6 minute', NULL, NULL, NULL, false, 'not_required', '{"meter_mode":"running"}'::jsonb),
  ('10000000-0000-0000-0000-000000000472', '10000000-0000-0000-0000-000000000423', '10000000-0000-0000-0000-000000000463', '10000000-0000-0000-0000-000000000352', '10000000-0000-0000-0000-000000000382', 'completed', now() - interval '3 day 18 minute', now() - interval '3 day 2 minute', 8.6, 960, false, 'not_required', '{"completed_via":"phone_dispatch"}'::jsonb)
ON CONFLICT (trip_id) DO UPDATE
SET order_id = EXCLUDED.order_id,
    assignment_id = EXCLUDED.assignment_id,
    vehicle_id = EXCLUDED.vehicle_id,
    driver_id = EXCLUDED.driver_id,
    trip_status = EXCLUDED.trip_status,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    actual_distance_km = EXCLUDED.actual_distance_km,
    actual_duration_sec = EXCLUDED.actual_duration_sec,
    proof_required = EXCLUDED.proof_required,
    proof_status = EXCLUDED.proof_status,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO ops.dispatch_trace_logs (
  trace_id, order_id, vehicle_id, driver_id, event_type, event_time, lat, lng, occupancy_status, payload_hash, source_channel, payload
)
VALUES
  ('10000000-0000-0000-0000-000000000481', '10000000-0000-0000-0000-000000000421', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000381', 'assigned', now() - interval '18 minute', 25.0401000, 121.5671000, 'to_pickup', 'hash-1', 'app', '{"eta_minutes":6}'::jsonb),
  ('10000000-0000-0000-0000-000000000482', '10000000-0000-0000-0000-000000000421', '10000000-0000-0000-0000-000000000351', '10000000-0000-0000-0000-000000000381', 'trip_started', now() - interval '6 minute', 25.0410000, 121.5655000, 'with_passenger', 'hash-2', 'driver_app', '{"driver_status":"on_trip"}'::jsonb),
  ('10000000-0000-0000-0000-000000000483', '10000000-0000-0000-0000-000000000423', '10000000-0000-0000-0000-000000000352', '10000000-0000-0000-0000-000000000382', 'completed', now() - interval '3 day 2 minute', 25.0285000, 121.5490000, 'empty', 'hash-3', 'call_center', '{"final_amount":320}'::jsonb)
ON CONFLICT (trace_id) DO NOTHING;

INSERT INTO ops.vehicle_location_logs (
  location_log_id, vehicle_id, observed_at, lat, lng, speed_kph, heading_deg, occupancy_status
)
VALUES
  ('10000000-0000-0000-0000-000000000491', '10000000-0000-0000-0000-000000000351', now() - interval '1 minute', 25.0451000, 121.5535000, 32.0, 180.0, 'with_passenger'),
  ('10000000-0000-0000-0000-000000000492', '10000000-0000-0000-0000-000000000353', now() - interval '2 minute', 25.0375000, 121.5637000, 0.0, 0.0, 'empty')
ON CONFLICT (location_log_id) DO NOTHING;

-- call / recording / complaint
INSERT INTO crm.call_sessions (
  call_id, call_type, caller_phone, agent_id, started_at, ended_at, recording_id, linked_order_id, linked_case_no, agent_identity_announced, status
)
VALUES
  ('10000000-0000-0000-0000-000000000501', 'booking', '0911-000-004', NULL, now() - interval '3 day 35 minute', now() - interval '3 day 30 minute', '10000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000423', 'CMP-20250410-0001', true, 'ended')
ON CONFLICT (call_id) DO UPDATE
SET call_type = EXCLUDED.call_type,
    caller_phone = EXCLUDED.caller_phone,
    started_at = EXCLUDED.started_at,
    ended_at = EXCLUDED.ended_at,
    recording_id = EXCLUDED.recording_id,
    linked_order_id = EXCLUDED.linked_order_id,
    linked_case_no = EXCLUDED.linked_case_no,
    agent_identity_announced = EXCLUDED.agent_identity_announced,
    status = EXCLUDED.status;

INSERT INTO crm.call_recordings (
  recording_id, call_id, object_key, duration_sec, checksum, retention_until
)
VALUES
  ('10000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000501', 'recordings/2025/04/phone-0001.wav', 300, 'sha256:recording-demo', now() + interval '90 day')
ON CONFLICT (recording_id) DO UPDATE
SET call_id = EXCLUDED.call_id,
    object_key = EXCLUDED.object_key,
    duration_sec = EXCLUDED.duration_sec,
    checksum = EXCLUDED.checksum,
    retention_until = EXCLUDED.retention_until;

INSERT INTO crm.complaint_cases (
  case_no, case_source, related_order_id, related_call_id, category, severity, received_at,
  assignee_id, sla_due_at, status, resolution_code, resolution_note, closed_at
)
VALUES
  ('CMP-20250410-0001', 'phone', '10000000-0000-0000-0000-000000000423', '10000000-0000-0000-0000-000000000501', '未準時到達', 'medium', now() - interval '2 day', NULL, now() + interval '1 day', 'under_investigation', NULL, NULL, NULL)
ON CONFLICT (case_no) DO UPDATE
SET case_source = EXCLUDED.case_source,
    related_order_id = EXCLUDED.related_order_id,
    related_call_id = EXCLUDED.related_call_id,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    received_at = EXCLUDED.received_at,
    assignee_id = EXCLUDED.assignee_id,
    sla_due_at = EXCLUDED.sla_due_at,
    status = EXCLUDED.status,
    resolution_code = EXCLUDED.resolution_code,
    resolution_note = EXCLUDED.resolution_note,
    closed_at = EXCLUDED.closed_at,
    updated_at = now();

INSERT INTO crm.complaint_timelines (
  timeline_id, case_no, event_type, actor_id, note
)
VALUES
  ('10000000-0000-0000-0000-000000000503', 'CMP-20250410-0001', 'case_created', NULL, '由申訴專線建立案件'),
  ('10000000-0000-0000-0000-000000000504', 'CMP-20250410-0001', 'investigation_started', NULL, '已調閱錄音與派遣紀錄')
ON CONFLICT (timeline_id) DO NOTHING;

-- billing / invoices / statements
INSERT INTO billing.tenant_invoices (
  invoice_id, tenant_id, invoice_no, period_from, period_to, total_amount, currency_code, status, issued_at, due_at
)
VALUES
  ('10000000-0000-0000-0000-000000000511', '10000000-0000-0000-0000-000000000201', 'INV-ACME-2025-04', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 2800, 'TWD', 'issued', now(), now() + interval '30 day')
ON CONFLICT (invoice_no) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    period_from = EXCLUDED.period_from,
    period_to = EXCLUDED.period_to,
    total_amount = EXCLUDED.total_amount,
    currency_code = EXCLUDED.currency_code,
    status = EXCLUDED.status,
    issued_at = EXCLUDED.issued_at,
    due_at = EXCLUDED.due_at,
    updated_at = now();

INSERT INTO billing.invoice_lines (
  invoice_line_id, invoice_id, order_id, description, quantity, unit_price, line_total
)
VALUES
  ('10000000-0000-0000-0000-000000000512', '10000000-0000-0000-0000-000000000511', NULL, '企業派車月結示範費用', 1, 2800, 2800)
ON CONFLICT (invoice_line_id) DO UPDATE
SET invoice_id = EXCLUDED.invoice_id,
    order_id = EXCLUDED.order_id,
    description = EXCLUDED.description,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    line_total = EXCLUDED.line_total;

INSERT INTO billing.driver_statements (
  statement_id, driver_id, period_month, fee_plan_id, gross_earning, service_fee, subsidy_amount, net_amount, receipt_no, generated_at, payout_status
)
VALUES
  ('10000000-0000-0000-0000-000000000513', '10000000-0000-0000-0000-000000000381', date_trunc('month', current_date)::date, '00000000-0000-0000-0000-000000000521', 5200, 650, 120, 4670, 'DRV-STMT-2025-04-001', now(), 'approved')
ON CONFLICT (driver_id, period_month) DO UPDATE
SET fee_plan_id = EXCLUDED.fee_plan_id,
    gross_earning = EXCLUDED.gross_earning,
    service_fee = EXCLUDED.service_fee,
    subsidy_amount = EXCLUDED.subsidy_amount,
    net_amount = EXCLUDED.net_amount,
    receipt_no = EXCLUDED.receipt_no,
    generated_at = EXCLUDED.generated_at,
    payout_status = EXCLUDED.payout_status,
    updated_at = now();

INSERT INTO billing.driver_statement_lines (
  line_id, statement_id, line_type, ref_id, description, amount
)
VALUES
  ('10000000-0000-0000-0000-000000000514', '10000000-0000-0000-0000-000000000513', 'trip_revenue', '10000000-0000-0000-0000-000000000421', '標準派遣收入', 5200),
  ('10000000-0000-0000-0000-000000000515', '10000000-0000-0000-0000-000000000513', 'service_fee', NULL, '平台服務費', -650),
  ('10000000-0000-0000-0000-000000000516', '10000000-0000-0000-0000-000000000513', 'promo_subsidy', NULL, '平台補差', 120)
ON CONFLICT (line_id) DO UPDATE
SET statement_id = EXCLUDED.statement_id,
    line_type = EXCLUDED.line_type,
    ref_id = EXCLUDED.ref_id,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount;

INSERT INTO billing.driver_reimbursement_batches (
  batch_id, period_month, status, total_amount, approved_at, paid_at
)
VALUES
  ('10000000-0000-0000-0000-000000000517', date_trunc('month', current_date)::date, 'paid', 120, now(), now())
ON CONFLICT (batch_id) DO UPDATE
SET period_month = EXCLUDED.period_month,
    status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    approved_at = EXCLUDED.approved_at,
    paid_at = EXCLUDED.paid_at,
    updated_at = now();

INSERT INTO billing.driver_reimbursement_items (
  item_id, batch_id, driver_id, order_id, reason_code, amount, proof_file_id
)
VALUES
  ('10000000-0000-0000-0000-000000000518', '10000000-0000-0000-0000-000000000517', '10000000-0000-0000-0000-000000000381', '10000000-0000-0000-0000-000000000421', 'platform_promo_absorb', 120, NULL)
ON CONFLICT (item_id) DO UPDATE
SET batch_id = EXCLUDED.batch_id,
    driver_id = EXCLUDED.driver_id,
    order_id = EXCLUDED.order_id,
    reason_code = EXCLUDED.reason_code,
    amount = EXCLUDED.amount,
    proof_file_id = EXCLUDED.proof_file_id;

-- report job / filing package demo
INSERT INTO admin.report_jobs (
  report_job_id, report_type, requested_by, tenant_id, scope, status, started_at, finished_at
)
VALUES
  ('10000000-0000-0000-0000-000000000521', 'tenant_trip_summary', NULL, '10000000-0000-0000-0000-000000000201', '{"period":"this_month"}'::jsonb, 'completed', now() - interval '5 minute', now() - interval '4 minute')
ON CONFLICT (report_job_id) DO UPDATE
SET report_type = EXCLUDED.report_type,
    tenant_id = EXCLUDED.tenant_id,
    scope = EXCLUDED.scope,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at;

INSERT INTO admin.filing_packages (
  package_id, package_type, generated_by, scope, status, generated_at
)
VALUES
  ('10000000-0000-0000-0000-000000000522', 'monthly_report', NULL, '{"month":"current"}'::jsonb, 'completed', now())
ON CONFLICT (package_id) DO UPDATE
SET package_type = EXCLUDED.package_type,
    scope = EXCLUDED.scope,
    status = EXCLUDED.status,
    generated_at = EXCLUDED.generated_at;

INSERT INTO admin.audit_logs (
  audit_id, actor_id, actor_type, tenant_id, module_name, action_name, resource_type, resource_id,
  old_value, new_value, request_id, ip_address, user_agent, hash_value
)
VALUES
  ('10000000-0000-0000-0000-000000000523', NULL, 'system', '10000000-0000-0000-0000-000000000201', 'dispatch', 'seed_insert', 'order', 'ORD-BIZ-0001', NULL, '{"status":"preassigned"}'::jsonb, 'seed-demo-001', '127.0.0.1', 'seed-script', 'sha256:audit-demo')
ON CONFLICT (audit_id) DO UPDATE
SET actor_type = EXCLUDED.actor_type,
    tenant_id = EXCLUDED.tenant_id,
    module_name = EXCLUDED.module_name,
    action_name = EXCLUDED.action_name,
    resource_type = EXCLUDED.resource_type,
    resource_id = EXCLUDED.resource_id,
    old_value = EXCLUDED.old_value,
    new_value = EXCLUDED.new_value,
    request_id = EXCLUDED.request_id,
    ip_address = EXCLUDED.ip_address,
    user_agent = EXCLUDED.user_agent,
    hash_value = EXCLUDED.hash_value;
