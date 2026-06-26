ALTER TABLE av_sandbox.sandbox_dispatch_decisions
  ADD COLUMN IF NOT EXISTS evaluation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE av_sandbox.sandbox_dispatch_decisions
  ADD COLUMN IF NOT EXISTS release_audit jsonb NOT NULL DEFAULT '{}'::jsonb;
