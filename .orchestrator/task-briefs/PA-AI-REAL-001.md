# Task Brief: PA-AI-REAL-001

Real provider gateway for Platform Admin assistant

- Status: `done`
- Owner: `Codex`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T13:45:29Z`

## 中文說明

把 Platform Admin assistant / OpenClaw runtime 從 mock-only provider 升級成 dev 可使用真實 LLM provider 的 gateway。

## Short Summary

Scope clarified for direct OpenClaw adoption: the real provider gateway must serve OpenClaw-backed assistant runs, not only the legacy mock chat path.

## Dependencies

- None

## Acceptance

- See task brief acceptance checklist

## Artifacts

- `apps/api/src/common/llm-gateway/`
- `apps/api/src/modules/platform-admin-assistant/`
- `.github/workflows/deploy-dev.yml`
- `docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md`

## Guardrails

- Use `tools/development-orchestrator/bin/ai-status.sh` or `python3 tools/development-orchestrator/bin/ai_status.py` for state changes.
- Treat `current-work.md` as a human summary, not canonical machine context.
