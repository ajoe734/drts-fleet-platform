# Task Brief: PA-AI-SEC-001

Platform Admin assistant safety, policy, redaction, and audit hardening

- Status: `backlog`
- Owner: `Codex2`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

建立 agentic assistant 的安全底座：RBAC、tool policy、prompt injection
防護、redaction、budget、rate limit、human confirmation、audit、dev/prod mode
差異。

## Short Summary

Harden the assistant before broad tool execution and worker dispatch.

## Dependencies

- None

## Acceptance

- Policy engine classifies tool calls by family, actor scope, environment, and risk.
- Prompt-injection tests cover page content, docs, tool output, and assistant transcript history.
- Redaction removes secrets, API keys, tokens, private headers, and once-only credentials before provider calls.
- Budget/rate limits are enforced and surfaced as degraded state.
- Assistant audit entries include session id, run id, actor id, tool name, risk level, and receipt id when applicable.
- Dev/staging/prod environment policies are explicit and tested.
- Security docs include OpenClaw-style sidecar risk boundaries and why direct unrestricted embedding is forbidden.

## Artifacts

- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.redaction.ts`
- `apps/api/src/modules/platform-admin-assistant/`
- `apps/api/src/common/llm-gateway/`
- `.orchestrator/permission_broker.py`
- `.orchestrator/worker_tree_guard.py`

## Guardrails

- No assistant tool may widen the current actor's permissions.
- No provider request may contain raw secrets.
- No high-risk write may execute without reason and confirmation.
