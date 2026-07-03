-- Service-area authority for governed serviceability checks.
-- The API service performs the authoritative geometry evaluation in TypeScript
-- from the immutable record/jsonb snapshot. The database keeps GeoJSON for audit
-- and admin export without requiring PostGIS privileges in dev/staging.

CREATE TABLE IF NOT EXISTS ops.service_area_boundaries (
  service_area_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code varchar(80) NOT NULL,
  display_name varchar(200) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'draft',
  geometry_geojson jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_product_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'active', 'retired')),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (area_code, version)
);

CREATE INDEX IF NOT EXISTS idx_service_area_boundaries_status
  ON ops.service_area_boundaries(status, effective_from, effective_until);

ALTER TABLE ops.service_area_boundaries
  ADD COLUMN IF NOT EXISTS geometry_geojson jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'service_area_boundaries'
      AND column_name = 'geometry'
  ) THEN
    ALTER TABLE ops.service_area_boundaries ALTER COLUMN geometry DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ops.stop_policies (
  stop_policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_code varchar(100) NOT NULL,
  display_name varchar(200) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'draft',
  direction varchar(20) NOT NULL,
  effect varchar(30) NOT NULL,
  geometry_geojson jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_area_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_product_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_code varchar(100) NOT NULL,
  reason_message text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  record jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft', 'active', 'retired')),
  CHECK (direction IN ('pickup', 'dropoff', 'both')),
  CHECK (effect IN ('allow', 'deny', 'manual_review')),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (policy_code, version)
);

CREATE INDEX IF NOT EXISTS idx_stop_policies_status
  ON ops.stop_policies(status, direction, effect, effective_from, effective_until);

ALTER TABLE ops.stop_policies
  ADD COLUMN IF NOT EXISTS geometry_geojson jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'stop_policies'
      AND column_name = 'geometry'
  ) THEN
    ALTER TABLE ops.stop_policies ALTER COLUMN geometry DROP NOT NULL;
  END IF;
END $$;
