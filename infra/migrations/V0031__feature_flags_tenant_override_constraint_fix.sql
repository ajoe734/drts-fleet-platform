-- V0030: Fix admin.feature_flags to support global + tenant-scoped override rows.
--
-- Background: V0014 declared `flag_key TEXT PRIMARY KEY` plus a composite UNIQUE
-- (flag_key, tenant_id). The sole primary key on flag_key makes it impossible to
-- store a global flag row (tenant_id IS NULL) AND one or more tenant-override rows
-- for the same flag_key: inserting a tenant override collides with the global row's
-- primary key and throws. The composite UNIQUE also fails to enforce global-row
-- uniqueness because SQL treats NULL tenant_id values as distinct.
--
-- The repository contract (FeatureFlagRepository) expects:
--   * exactly one global row per flag_key  (tenant_id IS NULL)
--   * at most one override row per (flag_key, tenant_id) for non-NULL tenant_id
-- which requires two partial unique indexes rather than a sole primary key.
--
-- This migration is idempotent: it converges both freshly-migrated databases
-- (which carry the V0014 primary key) and older volumes (which may already carry
-- the partial indexes) onto the same correct shape.

ALTER TABLE admin.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_pkey;

ALTER TABLE admin.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_tenant_unique;

ALTER TABLE admin.feature_flags
  ALTER COLUMN flag_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_key_unique
  ON admin.feature_flags (flag_key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_tenant_key_unique
  ON admin.feature_flags (flag_key, tenant_id)
  WHERE tenant_id IS NOT NULL;
