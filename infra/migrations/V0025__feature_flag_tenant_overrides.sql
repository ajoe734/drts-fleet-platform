-- Allow global feature flags and tenant-scoped overrides to coexist.
-- The original schema keyed rows by flag_key only, which prevented
-- inserting tenant overrides for an existing global flag.

ALTER TABLE admin.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_pkey;

ALTER TABLE admin.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_tenant_unique;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_key_unique
  ON admin.feature_flags (flag_key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_tenant_key_unique
  ON admin.feature_flags (flag_key, tenant_id)
  WHERE tenant_id IS NOT NULL;
