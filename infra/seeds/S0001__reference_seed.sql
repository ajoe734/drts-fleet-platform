-- S0001__reference_seed.sql
-- Minimal reference/master seed for Phase 1

-- operating areas
INSERT INTO core.operating_areas (area_id, area_code, area_name, city_name, region_name)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'TAIPEI_CITY', '台北市營業區', '台北市', '都會區'),
  ('00000000-0000-0000-0000-000000000102', 'TAOYUAN_AIRPORT', '桃園機場營業區', '桃園市', '機場區'),
  ('00000000-0000-0000-0000-000000000103', 'TAICHUNG_HARBOR', '台中港營業區', '台中市', '港區'),
  ('00000000-0000-0000-0000-000000000104', 'CHANGHUA_LUKANG', '鹿港營業區', '彰化縣', '鹿港')
ON CONFLICT (area_code) DO UPDATE
SET area_name = EXCLUDED.area_name,
    city_name = EXCLUDED.city_name,
    region_name = EXCLUDED.region_name,
    updated_at = now();

-- public info / placard
INSERT INTO admin.public_info_versions (
  version_id, title, call_phone, complaint_phone, call_rate_text, fare_text, payment_method_text,
  status, effective_from, published_at
)
VALUES (
  '00000000-0000-0000-0000-000000000401',
  'Phase1 Public Info v1',
  '0800-001-001',
  '0800-001-002',
  '依電信業者市話/行動費率計價',
  '標準計程車依跳表/公告費率；商務派車依合約或方案費率。',
  '現金、信用卡、企業月結、電子支付',
  'published',
  now(),
  now()
)
ON CONFLICT (version_id) DO UPDATE
SET title = EXCLUDED.title,
    call_phone = EXCLUDED.call_phone,
    complaint_phone = EXCLUDED.complaint_phone,
    call_rate_text = EXCLUDED.call_rate_text,
    fare_text = EXCLUDED.fare_text,
    payment_method_text = EXCLUDED.payment_method_text,
    status = EXCLUDED.status,
    effective_from = EXCLUDED.effective_from,
    published_at = EXCLUDED.published_at,
    updated_at = now();

INSERT INTO admin.placard_versions (
  placard_version_id, version_code, public_info_version_id, template_name, published_at
)
VALUES (
  '00000000-0000-0000-0000-000000000402',
  'PLACARD_V1',
  '00000000-0000-0000-0000-000000000401',
  'Seatback Placard Traditional Chinese v1',
  now()
)
ON CONFLICT (version_code) DO UPDATE
SET public_info_version_id = EXCLUDED.public_info_version_id,
    template_name = EXCLUDED.template_name,
    published_at = EXCLUDED.published_at,
    updated_at = now();

-- SLA templates
INSERT INTO ops.sla_templates (
  sla_template_id, template_code, template_name, wait_minutes, arrival_threshold_minutes,
  completion_threshold_minutes, modifiable_until_minutes, cancelable_until_minutes,
  requires_signoff, requires_photo_proof, requires_expense_proof
)
VALUES
  ('00000000-0000-0000-0000-000000000501', 'STD_DEFAULT', '標準派遣預設 SLA', 5, 15, 180, 10, 10, false, false, false),
  ('00000000-0000-0000-0000-000000000502', 'BIZ_ENTERPRISE', '企業派車 SLA', 10, 10, 240, 30, 30, true, true, false),
  ('00000000-0000-0000-0000-000000000503', 'BIZ_AIRPORT', '機場接送 SLA', 20, 15, 300, 60, 60, false, true, true)
ON CONFLICT (template_code) DO UPDATE
SET template_name = EXCLUDED.template_name,
    wait_minutes = EXCLUDED.wait_minutes,
    arrival_threshold_minutes = EXCLUDED.arrival_threshold_minutes,
    completion_threshold_minutes = EXCLUDED.completion_threshold_minutes,
    modifiable_until_minutes = EXCLUDED.modifiable_until_minutes,
    cancelable_until_minutes = EXCLUDED.cancelable_until_minutes,
    requires_signoff = EXCLUDED.requires_signoff,
    requires_photo_proof = EXCLUDED.requires_photo_proof,
    requires_expense_proof = EXCLUDED.requires_expense_proof,
    updated_at = now();

-- qualification profiles
INSERT INTO ops.qualification_profiles (
  qualification_profile_id, profile_code, profile_name, service_bucket,
  allowed_license_classes, allowed_vehicle_forms, required_service_tags, allow_forwarder
)
VALUES
  (
    '00000000-0000-0000-0000-000000000511',
    'QP_STD_TAXI',
    '標準計程車資格',
    'standard_taxi',
    ARRAY['taxi','multi_taxi']::reg.license_class_t[],
    ARRAY['sedan','wagon','accessible']::reg.vehicle_form_t[],
    ARRAY[]::text[],
    true
  ),
  (
    '00000000-0000-0000-0000-000000000512',
    'QP_BIZ_SEDAN',
    '商務轎車資格',
    'business_dispatch',
    ARRAY['rental','multi_taxi','taxi']::reg.license_class_t[],
    ARRAY['sedan','wagon']::reg.vehicle_form_t[],
    ARRAY['vip']::text[],
    false
  ),
  (
    '00000000-0000-0000-0000-000000000513',
    'QP_BIZ_MPV',
    '商務 MPV / 機場接送資格',
    'business_dispatch',
    ARRAY['rental','multi_taxi']::reg.license_class_t[],
    ARRAY['mpv']::reg.vehicle_form_t[],
    ARRAY['airport','luggage']::text[],
    false
  )
ON CONFLICT (profile_code) DO UPDATE
SET profile_name = EXCLUDED.profile_name,
    service_bucket = EXCLUDED.service_bucket,
    allowed_license_classes = EXCLUDED.allowed_license_classes,
    allowed_vehicle_forms = EXCLUDED.allowed_vehicle_forms,
    required_service_tags = EXCLUDED.required_service_tags,
    allow_forwarder = EXCLUDED.allow_forwarder,
    updated_at = now();

-- driver fee plan
INSERT INTO billing.driver_fee_plans (
  plan_id, plan_name, version_no, effective_from, calculation_method, rule_json,
  approved_at, status
)
VALUES (
  '00000000-0000-0000-0000-000000000521',
  'DEFAULT_DRIVER_FEE',
  'v1',
  now(),
  'percentage',
  '{"service_fee_pct": 12.5, "minimum_monthly_fee": 0, "promo_subsidy_policy": "platform_absorbs"}'::jsonb,
  now(),
  'published'
)
ON CONFLICT (plan_name, version_no) DO UPDATE
SET effective_from = EXCLUDED.effective_from,
    calculation_method = EXCLUDED.calculation_method,
    rule_json = EXCLUDED.rule_json,
    approved_at = EXCLUDED.approved_at,
    status = EXCLUDED.status,
    updated_at = now();

-- external service mappings
INSERT INTO ops.external_service_mappings (
  mapping_id, source_system, external_service_code, external_service_name,
  service_bucket, dispatch_semantics, qualification_profile_id, settlement_mode
)
VALUES
  (
    '00000000-0000-0000-0000-000000000531',
    'platform_alpha',
    'taxi.standard',
    'Platform Alpha 標準計程車',
    'standard_taxi',
    'forwarder_broadcast',
    '00000000-0000-0000-0000-000000000511',
    'external_authoritative'
  ),
  (
    '00000000-0000-0000-0000-000000000532',
    'platform_beta',
    'airport.transfer',
    'Platform Beta 機場接送',
    'business_dispatch',
    'forwarder_broadcast',
    '00000000-0000-0000-0000-000000000513',
    'external_authoritative'
  )
ON CONFLICT (source_system, external_service_code) DO UPDATE
SET external_service_name = EXCLUDED.external_service_name,
    service_bucket = EXCLUDED.service_bucket,
    dispatch_semantics = EXCLUDED.dispatch_semantics,
    qualification_profile_id = EXCLUDED.qualification_profile_id,
    settlement_mode = EXCLUDED.settlement_mode,
    updated_at = now();
