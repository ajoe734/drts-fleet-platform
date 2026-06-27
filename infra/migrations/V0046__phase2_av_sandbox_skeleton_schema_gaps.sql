-- Phase2: backfill columns the repositories require but the V0037 "evidence
-- skeleton" migration omitted, so persistence was silently skipped at runtime:
--   * av_sandbox.command_receipts.record  (TeslaIntegrationRepository round-trip)
--   * av_sandbox.sandbox_dispatch_decisions.evaluation_snapshot / release_audit
--     (SandboxDispatchGateRepository.persistEvaluation: "column ... does not exist")
-- Additive + idempotent.
ALTER TABLE av_sandbox.command_receipts
  ADD COLUMN IF NOT EXISTS record jsonb;

ALTER TABLE av_sandbox.sandbox_dispatch_decisions
  ADD COLUMN IF NOT EXISTS evaluation_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS release_audit jsonb;
