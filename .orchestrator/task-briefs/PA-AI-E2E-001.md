# Task Brief: PA-AI-E2E-001

Platform Admin agentic assistant live dev E2E and eval pack

- Status: `backlog`
- Owner: `Gemini`
- Reviewer: `Codex`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

建立完整驗收：真 provider、頁面上下文、讀資料、表單填寫、操作 preview/execute、
SA/SD 產生、dispatch packet、supervisor status、prompt injection/security eval。

## Short Summary

Build the live dev E2E and safety eval suite for the Platform Admin agentic
assistant.

## Dependencies

- `PA-AI-REAL-001`
- `PA-AI-CTX-001`
- `PA-AI-RAG-001`
- `PA-AI-TOOLS-001`
- `PA-AI-ACTION-001`
- `PA-AI-DEV-001`
- `PA-AI-ORCH-001`
- `PA-AI-SEC-001`

## Acceptance

- Live dev smoke proves runtime provider is non-mock when key is configured.
- E2E asks about `/payments`, verifies page context appears in answer, and receives cited guidance.
- E2E invokes at least one caller-scoped read tool and verifies bounded output.
- E2E proposes form fills and applies them only after user confirmation.
- E2E previews and executes one safe Platform Admin action, then verifies receipt and audit.
- E2E generates SA/SD/task brief dry-run artifacts from a feature-change request.
- E2E submits an orchestrator dispatch packet in dry-run mode and reads status.
- Security eval includes prompt injection, forbidden scope, missing provider key, budget exceeded, and high-risk action without reason.

## Artifacts

- `tests/e2e/platform-admin-assistant-overlay.spec.ts`
- `tests/e2e/`
- `apps/api/tests/`
- `docs/04-uat/`
- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`

## Guardrails

- Do not require production credentials for tests.
- Live dev tests must be skippable with explicit `EXTERNAL-GATED` output when real provider key is absent.
- Do not mutate irreversible records in dev E2E.
