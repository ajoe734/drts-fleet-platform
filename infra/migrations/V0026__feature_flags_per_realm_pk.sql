-- ASSIST-FF: allow per-realm feature flag overrides
--
-- V0014 created admin.feature_flags with `flag_key` as the sole PRIMARY KEY.
-- That made it impossible to persist a global row (tenant_id IS NULL) alongside
-- per-tenant override rows (tenant_id = '<realm>') for the same flag_key: the
-- second row sharing a flag_key violated the primary key before the composite
-- UNIQUE (flag_key, tenant_id) constraint could apply. As a result
-- FeatureFlagRepository.upsertTenantOverride could never store a per-realm
-- toggle (e.g. ops.assistant.enabled on for one realm only) — the INSERT threw
-- on the primary key rather than upserting the tenant row.
--
-- Fix: drop the single-column primary key so multiple rows may share a
-- flag_key. Uniqueness is preserved by:
--   * the existing composite UNIQUE (flag_key, tenant_id) constraint, which the
--     repository's `ON CONFLICT (flag_key, tenant_id)` upsert infers for
--     tenant-scoped override rows; and
--   * a new partial unique index guaranteeing at most one global definition per
--     flag_key (under a plain composite unique, NULL tenant_id values are
--     treated as distinct, so the partial index is required to keep globals
--     singular — mirroring the null-aware scope indexes in V0023).

ALTER TABLE admin.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_key_unique
  ON admin.feature_flags (flag_key)
  WHERE tenant_id IS NULL;
