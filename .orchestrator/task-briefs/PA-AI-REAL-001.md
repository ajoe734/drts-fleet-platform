# Task Brief: PA-AI-REAL-001

Real provider gateway for Platform Admin assistant

- Status: `backlog`
- Owner: `Gemini`
- Reviewer: `Claude2`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

把 Platform Admin assistant 從 mock-only provider 升級成 dev 可使用真實 LLM
provider 的 gateway。前端不可取得 provider key/model 設定，所有 provider
credential 只存在 API runtime / Secret Manager。

## Short Summary

Implement real provider adapters and runtime config enforcement for the Platform
Admin assistant.

## Dependencies

- None

## Acceptance

- `PlatformAdminAssistantProviderKind` supports at least `mock` plus one real provider.
- API runtime reads provider/model/key/budget settings from backend-only env vars.
- Missing real provider key fails fast outside local/CI mock fallback policy.
- Dev deploy can run with `LLM_GATEWAY_PROVIDER` set to a real provider.
- Provider telemetry records provider kind, model, token estimates, latency, and degraded state.
- Frontend receives no provider key, provider slug, or model identifiers.
- Targeted unit tests cover mock fallback, missing key, real provider selection, and budget config.

## Artifacts

- `apps/api/src/common/llm-gateway/`
- `apps/api/src/modules/platform-admin-assistant/`
- `.github/workflows/deploy-dev.yml`
- `docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md`

## Guardrails

- Do not put provider credentials in `platform-admin-web`.
- Do not make mock responses appear as production-ready dev behavior.
- Keep local/CI deterministic by retaining mock mode.
