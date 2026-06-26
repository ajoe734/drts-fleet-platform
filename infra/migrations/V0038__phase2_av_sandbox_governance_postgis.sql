-- V0038 — Phase 2 AV sandbox governance PostGIS persistence.
--
-- Adds approved operating areas / pickup-dropoff zones, approved routes, and
-- effective-dated vehicle + safety-operator enrollment records. Geometry is
-- stored as PostGIS MultiPolygon / MultiLineString with GIST indexes while the
-- JSON record column preserves the full contract payload.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS av_sandbox.approved_operating_areas (
  area_id varchar(100) PRIMARY KEY,
  sandbox_program_id varchar(100) NOT NULL,
  area_kind text NOT NULL,
  area_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  operating_area geometry(MultiPolygon, 4326) NOT NULL,
  pickup_dropoff_zone geometry(MultiPolygon, 4326) NULL,
  schedules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approved_operating_areas_program_effective
  ON av_sandbox.approved_operating_areas(
    sandbox_program_id,
    active,
    effective_from DESC,
    updated_at DESC
  );
CREATE INDEX IF NOT EXISTS gist_approved_operating_areas_geometry
  ON av_sandbox.approved_operating_areas
  USING GIST (operating_area);
CREATE INDEX IF NOT EXISTS gist_approved_operating_areas_pickup_dropoff_zone
  ON av_sandbox.approved_operating_areas
  USING GIST (pickup_dropoff_zone);

CREATE TABLE IF NOT EXISTS av_sandbox.approved_routes (
  route_id varchar(100) PRIMARY KEY,
  sandbox_program_id varchar(100) NOT NULL,
  route_name text NOT NULL,
  area_id varchar(100) NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  route_geometry geometry(MultiLineString, 4326) NOT NULL,
  schedules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approved_routes_program_effective
  ON av_sandbox.approved_routes(
    sandbox_program_id,
    active,
    effective_from DESC,
    updated_at DESC
  );
CREATE INDEX IF NOT EXISTS gist_approved_routes_geometry
  ON av_sandbox.approved_routes
  USING GIST (route_geometry);

CREATE TABLE IF NOT EXISTS av_sandbox.vehicle_enrollments (
  enrollment_id varchar(100) PRIMARY KEY,
  sandbox_program_id varchar(100) NOT NULL,
  vehicle_id varchar(100) NOT NULL,
  provider_code varchar(100) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  approved_area_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_route_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_concurrent_trips integer NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_enrollments_vehicle
  ON av_sandbox.vehicle_enrollments(
    sandbox_program_id,
    vehicle_id,
    effective_from DESC,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS av_sandbox.safety_operator_qualifications (
  qualification_id varchar(100) PRIMARY KEY,
  sandbox_program_id varchar(100) NOT NULL,
  safety_operator_id varchar(100) NOT NULL,
  provider_code varchar(100) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  approved_area_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_route_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  certification_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_safety_operator_qualifications_operator
  ON av_sandbox.safety_operator_qualifications(
    sandbox_program_id,
    safety_operator_id,
    effective_from DESC,
    updated_at DESC
  );
