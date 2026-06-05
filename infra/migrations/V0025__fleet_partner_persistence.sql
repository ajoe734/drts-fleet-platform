CREATE TABLE IF NOT EXISTS admin.phase1_fleet_partners (
  fleet_partner_id varchar(150) PRIMARY KEY,
  business_registration_no varchar(100) NOT NULL UNIQUE,
  active boolean NOT NULL,
  partnership_type varchar(80) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.phase1_driver_fleet_affiliations (
  affiliation_id varchar(150) PRIMARY KEY,
  driver_id varchar(100) NOT NULL,
  fleet_partner_id varchar(150) NOT NULL,
  affiliation_type varchar(80) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_fleet_partners_active
  ON admin.phase1_fleet_partners(active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_fleet_partners_type
  ON admin.phase1_fleet_partners(partnership_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_fleet_affiliations_driver
  ON ops.phase1_driver_fleet_affiliations(driver_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_fleet_affiliations_partner
  ON ops.phase1_driver_fleet_affiliations(
    fleet_partner_id,
    effective_from DESC
  );
