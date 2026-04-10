-- V0003__core_master_data.sql

CREATE TABLE IF NOT EXISTS core.operating_areas (
  area_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code varchar(50) NOT NULL UNIQUE,
  area_name varchar(200) NOT NULL,
  city_name varchar(100),
  region_name varchar(100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.tenants (
  tenant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code varchar(50) NOT NULL UNIQUE,
  tenant_name varchar(200) NOT NULL,
  tenant_type varchar(50) NOT NULL,
  status core.tenant_status_t NOT NULL DEFAULT 'active',
  brand_name varchar(200),
  default_area_id uuid REFERENCES core.operating_areas(area_id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.partners (
  partner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code varchar(50) NOT NULL UNIQUE,
  partner_name varchar(200) NOT NULL,
  partner_type core.partner_type_t NOT NULL,
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  area_id uuid REFERENCES core.operating_areas(area_id),
  contact_name varchar(100),
  contact_email varchar(200),
  contact_phone varchar(50),
  status varchar(30) NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.sites (
  site_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(tenant_id),
  site_code varchar(50) NOT NULL,
  site_name varchar(200) NOT NULL,
  area_id uuid REFERENCES core.operating_areas(area_id),
  address_text varchar(500),
  lat numeric(10,7),
  lng numeric(10,7),
  contact_name varchar(100),
  contact_phone varchar(50),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_code)
);

CREATE TABLE IF NOT EXISTS core.call_points (
  call_point_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES core.sites(site_id),
  point_code varchar(50) NOT NULL,
  point_name varchar(200) NOT NULL,
  point_type varchar(50) NOT NULL DEFAULT 'concierge',
  address_text varchar(500),
  lat numeric(10,7),
  lng numeric(10,7),
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, point_code)
);

CREATE TABLE IF NOT EXISTS core.passengers (
  passenger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES core.tenants(tenant_id),
  full_name varchar(100) NOT NULL,
  employee_no varchar(50),
  department_name varchar(100),
  mobile varchar(50),
  email varchar(200),
  active_flag boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.address_books (
  address_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES core.tenants(tenant_id),
  owner_passenger_id uuid REFERENCES core.passengers(passenger_id),
  address_name varchar(200) NOT NULL,
  address_text varchar(500) NOT NULL,
  lat numeric(10,7),
  lng numeric(10,7),
  tags text[],
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sites_tenant ON core.sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_points_site ON core.call_points(site_id);
CREATE INDEX IF NOT EXISTS idx_passengers_tenant ON core.passengers(tenant_id);
