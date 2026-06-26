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
