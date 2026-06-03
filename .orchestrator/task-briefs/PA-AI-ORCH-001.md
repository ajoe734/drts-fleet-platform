# Task Brief: PA-AI-ORCH-001

Platform Admin assistant orchestrator bridge

- Status: `backlog`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

建立小幫手與 supervisor/auto worker 的安全 bridge。Web/API 不可直接 shell，
而是送 signed dispatch packet，由 bridge 負責 task brief、queue、worker tree
guard、branch routing、worker status。

## Short Summary

Create a governed bridge between Platform Admin assistant development tools and
the existing `.orchestrator` control plane.

## Dependencies

- `PA-AI-DEV-001` for task brief and SA/SD packet contract.
- `PA-AI-SEC-001` for signing, policy, and guard requirements.

## Acceptance

- Dispatch packet schema `assistant_dispatch_packet.v1` is documented and typed.
- Bridge validates task id, owner, reviewer, dependencies, artifacts, and risk.
- Bridge uses existing branch routing to resolve base branch.
- Bridge runs worker tree guard before writing or dispatching.
- Bridge can dry-run queue creation without starting workers.
- Bridge can report supervisor/worker/PR/CI/deploy status back to the assistant.
- Tests cover rejected malformed packet, rejected unsafe path, dry-run success, and status readback.

## Artifacts

- `.orchestrator/`
- `apps/api/src/modules/platform-admin-assistant/`
- `docs/03-runbooks/auto-worker-efficiency-control-plane-redesign.md`
- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`

## Guardrails

- Do not execute shell from the Platform Admin web process.
- Do not dispatch work that has not been confirmed by a human actor.
- Use isolated worktrees for worker execution.
