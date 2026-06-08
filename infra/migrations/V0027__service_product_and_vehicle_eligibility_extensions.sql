CREATE TABLE IF NOT EXISTS ops.phase1_service_products (
  service_product_id text PRIMARY KEY,
  service_product_type text NOT NULL,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  timing text NOT NULL,
  allowed_license_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  meter_required boolean NOT NULL DEFAULT false,
  fixed_fare_allowed boolean NOT NULL DEFAULT false,
  default_billing_mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);

ALTER TABLE ops.phase1_service_products
  ADD COLUMN IF NOT EXISTS allowed_license_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meter_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fixed_fare_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE admin.phase1_vehicle_eligibility_matrix
  ADD COLUMN IF NOT EXISTS conditionally_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS training_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permit_required boolean NOT NULL DEFAULT false;

UPDATE ops.phase1_service_products
SET
  allowed_license_types = CASE service_product_type
    WHEN 'taxi_realtime' THEN '["taxi","multi_purpose_taxi"]'::jsonb
    WHEN 'taxi_reservation' THEN '["taxi","multi_purpose_taxi"]'::jsonb
    WHEN 'enterprise_dispatch' THEN '["taxi","multi_purpose_taxi","rental_car","business_vehicle"]'::jsonb
    WHEN 'credit_card_airport_transfer' THEN '["multi_purpose_taxi","rental_car","business_vehicle","airport_transfer_vehicle"]'::jsonb
    WHEN 'insurance_replacement_vehicle' THEN '["rental_car","business_vehicle"]'::jsonb
    WHEN 'travel_agency_transfer' THEN '["business_vehicle","airport_transfer_vehicle"]'::jsonb
    WHEN 'third_party_forwarded_order' THEN '["taxi","multi_purpose_taxi"]'::jsonb
    ELSE COALESCE(allowed_license_types, '[]'::jsonb)
  END,
  meter_required = CASE service_product_type
    WHEN 'taxi_realtime' THEN true
    WHEN 'taxi_reservation' THEN true
    ELSE false
  END,
  fixed_fare_allowed = CASE service_product_type
    WHEN 'enterprise_dispatch' THEN true
    WHEN 'credit_card_airport_transfer' THEN true
    WHEN 'insurance_replacement_vehicle' THEN true
    WHEN 'travel_agency_transfer' THEN true
    ELSE false
  END,
  record = record ||
    jsonb_build_object(
      'allowedLicenseTypes',
      CASE service_product_type
        WHEN 'taxi_realtime' THEN '["taxi","multi_purpose_taxi"]'::jsonb
        WHEN 'taxi_reservation' THEN '["taxi","multi_purpose_taxi"]'::jsonb
        WHEN 'enterprise_dispatch' THEN '["taxi","multi_purpose_taxi","rental_car","business_vehicle"]'::jsonb
        WHEN 'credit_card_airport_transfer' THEN '["multi_purpose_taxi","rental_car","business_vehicle","airport_transfer_vehicle"]'::jsonb
        WHEN 'insurance_replacement_vehicle' THEN '["rental_car","business_vehicle"]'::jsonb
        WHEN 'travel_agency_transfer' THEN '["business_vehicle","airport_transfer_vehicle"]'::jsonb
        WHEN 'third_party_forwarded_order' THEN '["taxi","multi_purpose_taxi"]'::jsonb
        ELSE COALESCE(record->'allowedLicenseTypes', '[]'::jsonb)
      END,
      'meterRequired',
      CASE service_product_type
        WHEN 'taxi_realtime' THEN true
        WHEN 'taxi_reservation' THEN true
        ELSE false
      END,
      'fixedFareAllowed',
      CASE service_product_type
        WHEN 'enterprise_dispatch' THEN true
        WHEN 'credit_card_airport_transfer' THEN true
        WHEN 'insurance_replacement_vehicle' THEN true
        WHEN 'travel_agency_transfer' THEN true
        ELSE false
      END
    );

UPDATE admin.phase1_vehicle_eligibility_matrix
SET
  conditionally_allowed = COALESCE((record->>'conditionallyAllowed')::boolean, false),
  required_documents = COALESCE(record->'requiredDocuments', '[]'::jsonb),
  training_required = COALESCE((record->>'trainingRequired')::boolean, false),
  permit_required = COALESCE((record->>'permitRequired')::boolean, false),
  record = record ||
    jsonb_build_object(
      'conditionallyAllowed', COALESCE((record->>'conditionallyAllowed')::boolean, false),
      'requiredDocuments', COALESCE(record->'requiredDocuments', '[]'::jsonb),
      'trainingRequired', COALESCE((record->>'trainingRequired')::boolean, false),
      'permitRequired', COALESCE((record->>'permitRequired')::boolean, false)
    );
