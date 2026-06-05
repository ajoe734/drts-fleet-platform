CREATE TABLE IF NOT EXISTS admin.phase1_vehicle_eligibility_matrix (
  capability_id   text PRIMARY KEY,
  license_type    text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  effective_from  timestamptz NOT NULL,
  effective_until timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  record          jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_vehicle_eligibility_matrix_license_type
  ON admin.phase1_vehicle_eligibility_matrix (license_type, effective_from DESC);
