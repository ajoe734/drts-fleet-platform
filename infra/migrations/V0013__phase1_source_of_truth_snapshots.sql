CREATE TABLE IF NOT EXISTS core.phase1_tenant_passengers (
  passenger_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  active_flag boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS core.phase1_tenant_addresses (
  address_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  active_flag boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_user_roles (
  user_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  role_code varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  invited_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_tenant_api_keys (
  api_key_id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reg.phase1_registry_contracts (
  contract_id varchar(100) PRIMARY KEY,
  vehicle_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reg.phase1_registry_policies (
  policy_id varchar(100) PRIMARY KEY,
  vehicle_id varchar(100) NOT NULL,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS reg.phase1_registry_exclusivities (
  vehicle_id varchar(100) PRIMARY KEY,
  review_status varchar(50) NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_public_info_versions (
  version_id varchar(100) PRIMARY KEY,
  status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin.phase1_placard_versions (
  placard_version_id varchar(100) PRIMARY KEY,
  public_info_version_id varchar(100) NOT NULL,
  version_code varchar(100) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_tenant_passengers_tenant
  ON core.phase1_tenant_passengers(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_addresses_tenant
  ON core.phase1_tenant_addresses(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_user_roles_tenant
  ON admin.phase1_tenant_user_roles(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_tenant_api_keys_tenant
  ON admin.phase1_tenant_api_keys(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_registry_contracts_vehicle
  ON reg.phase1_registry_contracts(vehicle_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_registry_policies_vehicle
  ON reg.phase1_registry_policies(vehicle_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_public_info_versions_status
  ON admin.phase1_public_info_versions(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_placard_versions_public_info
  ON admin.phase1_placard_versions(public_info_version_id, updated_at DESC);
