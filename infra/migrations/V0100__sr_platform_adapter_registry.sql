-- V0100__sr_platform_adapter_registry.sql
-- SR-ADMIN-ADAPTER-001: no table existed for the platform adapter registry
-- domain before this migration (platform_admin.repository.ts's
-- PlatformAdminState only covered tenants/public-info/placards). Allocation:
-- docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (additional_allocations[V0100], reserved by SR-RECOVERY-CONTRACTS-20260911).
--
-- `revision` is the optimistic-concurrency column: every UPDATE is
-- `WHERE id = $1 AND revision = $expectedRevision` and bumps revision in the
-- same statement, so zero rows affected means a stale expectedRevision, never
-- a silent overwrite.
--
-- `credential_expiry_reference` / `credential_expiry_expires_at` are a
-- non-secret pointer to the credential material actually installed (e.g. a
-- rotation/version id) plus its expiry -- never the secret itself -- and are
-- nullable independently of each other: absent/unrecorded expiry data is a
-- valid, distinct state (surfaced client-side as "unknown"), not an error.
-- The credential-expiry-warning state itself is computed at read time
-- (packages/contracts/src/platform-adapter-registry.ts
-- AdapterCredentialExpiryWarning) against a server-side warning window; it is
-- not persisted here and changing the window needs no migration or backfill.
CREATE TABLE IF NOT EXISTS admin.phase1_platform_adapters (
  id text PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1,
  credential_expiry_reference text,
  credential_expiry_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_phase1_platform_adapters_revision_positive
    CHECK (revision > 0)
);

-- Server-generated evidence of one mutation; never client-constructed
-- (packages/contracts/src/platform-adapter-registry.ts
-- PlatformAdapterAuditEvidence). Inserted in the same transaction as the
-- adapter UPDATE (both succeed or both roll back), so `lastMutationAudit` on
-- the returned record is always the row the caller can see, never a promise
-- of an audit write that might not have landed.
CREATE TABLE IF NOT EXISTS admin.phase1_platform_adapter_mutation_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id text NOT NULL REFERENCES admin.phase1_platform_adapters(id),
  previous_revision integer NOT NULL,
  new_revision integer NOT NULL,
  reason text NOT NULL,
  actor_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phase1_platform_adapter_mutation_audit_adapter
  ON admin.phase1_platform_adapter_mutation_audit(adapter_id, occurred_at DESC);
