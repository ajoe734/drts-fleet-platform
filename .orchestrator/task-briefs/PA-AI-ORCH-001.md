# Task Brief: PA-AI-ORCH-001

Platform Admin assistant OpenClaw supervisor bridge

- Status: `done`
- Owner: `Codex2`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T14:04:52Z`

## 中文說明

建立 OpenClaw 主 runtime 與 supervisor/auto worker 的安全整合層，透過 signed dispatch packet、tool profile、tree guard、branch routing、worker status 把 DRTS control plane 包在 OpenClaw 外圍。

## Short Summary

Owner finalized review-approved OpenClaw bridge work, added closeout verification commit, pushed branch, and recorded branch-only integration status. Verification: pnpm --dir apps/api run typecheck; pnpm --dir apps/api exec vitest run…

## Dependencies

- `PA-AI-DEV-001`
- `PA-AI-SEC-001`

## Acceptance

- Dispatch packet schema assistant_dispatch_packet.v1 is documented and typed for OpenClaw-backed runs.
- Bridge validates task id, owner, reviewer, dependencies, artifacts, risk, and OpenClaw runtime profile.
- Bridge issues scoped credentials or tool manifests to OpenClaw instead of broad long-lived tokens.
- Bridge uses existing branch routing to resolve base branch and runs tree guard before write or dispatch.
- Bridge can dry-run queue creation and OpenClaw launch without starting live workers.
- Bridge can report supervisor, worker, OpenClaw run/session, PR, CI, and deploy status back to the assistant.
- Tests cover rejected malformed packet, rejected unsafe tool scope, dry-run success, and status readback.

## Artifacts

- `.orchestrator/`
- `apps/api/src/modules/platform-admin-assistant/`
- `docs/03-runbooks/auto-worker-efficiency-control-plane-redesign.md`
- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`

## Guardrails

- Use `tools/development-orchestrator/bin/ai-status.sh` or `python3 tools/development-orchestrator/bin/ai_status.py` for state changes.
- Treat `current-work.md` as a human summary, not canonical machine context.
