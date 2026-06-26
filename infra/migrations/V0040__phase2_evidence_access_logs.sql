-- V0040 — Phase 2 evidence-access dual-write store (P2-DP-S4-001, S4=a).
--
-- Source of truth:
--   ai-status.json task P2-DP-S4-001 (S4 ruling a)
--   phase2-tesla-fsd-sandbox-202606 phase SD §3 (audit / evidence custody)
--
-- S4 ruling (a): Phase 2 audit shares the Phase 1 append-only audit store
-- (admin.audit_logs) through the single C5/S4 emitter. Evidence-access events
-- are additionally mirrored here so the chain-of-custody surface owns its own
-- queryable access trail without forking the canonical audit body. Each row is
-- linked 1:1 to its admin.audit_logs row by audit_id, so there is one emitter
-- and no divergent second audit store.
--
-- All statements are idempotent so re-application is a no-op.

CREATE SCHEMA IF NOT EXISTS av_evidence;

CREATE TABLE IF NOT EXISTS av_evidence.evidence_access_logs (
  access_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1:1 link back to the canonical Phase 1 audit row (admin.audit_logs).
  audit_id uuid NOT NULL UNIQUE,

  evidence_family text NOT NULL,
  access_action text NOT NULL,

  actor_id text NULL,
  actor_type text NOT NULL,
  tenant_id text NULL,

  resource_type text NOT NULL,
  resource_id text NULL,

  request_id text NOT NULL,
  context jsonb NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_access_logs_family
  ON av_evidence.evidence_access_logs(evidence_family, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_access_logs_tenant
  ON av_evidence.evidence_access_logs(tenant_id, created_at DESC);

-- Enforce the 1:1 link at the database level: an evidence-access row cannot
-- exist without its canonical admin.audit_logs row. Combined with the
-- transactional dual-write in AuditLogRepository (canonical row inserted first,
-- then the mirror, both committed together), this makes orphan evidence-access
-- rows impossible even if the canonical insert fails. ON DELETE RESTRICT keeps
-- the append-only chain-of-custody guarantee: a canonical audit row that still
-- has an evidence-access mirror cannot be deleted out from under it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_evidence_access_logs_audit_id'
      AND conrelid = 'av_evidence.evidence_access_logs'::regclass
  ) THEN
    ALTER TABLE av_evidence.evidence_access_logs
      ADD CONSTRAINT fk_evidence_access_logs_audit_id
      FOREIGN KEY (audit_id)
      REFERENCES admin.audit_logs(audit_id)
      ON DELETE RESTRICT;
  END IF;
END$$;
