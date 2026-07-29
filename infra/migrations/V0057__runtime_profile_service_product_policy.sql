CREATE TABLE IF NOT EXISTS ops.runtime_profile_service_product_policies (
  runtime_profile_code text NOT NULL,
  service_product_code text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (runtime_profile_code, service_product_code),
  CHECK (runtime_profile_code IN (
    'ordinary_taxi',
    'multi_taxi_direct',
    'business_dispatch'
  )),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

INSERT INTO ops.runtime_profile_service_product_policies (
  runtime_profile_code,
  service_product_code,
  active,
  effective_from,
  effective_until,
  created_at,
  updated_at,
  record
) VALUES (
  'multi_taxi_direct',
  'taxi_reservation',
  true,
  '2026-01-01T00:00:00.000Z',
  NULL,
  now(),
  now(),
  jsonb_build_object(
    'runtimeProfileCode', 'multi_taxi_direct',
    'serviceProductCode', 'taxi_reservation',
    'active', true,
    'effectiveFrom', '2026-01-01T00:00:00.000Z',
    'effectiveUntil', NULL,
    'createdAt', now(),
    'updatedAt', now()
  )
)
ON CONFLICT (runtime_profile_code, service_product_code) DO NOTHING;
