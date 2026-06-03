# Task Brief: PA-AI-TOOLS-001

Platform Admin assistant caller-scoped read tools

- Status: `backlog`
- Owner: `Claude`
- Reviewer: `Codex2`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

補齊小幫手「看得到系統內容」所需的 caller-scoped read tools。它可以讀目前
Platform Admin 使用者有權看的 tenant、partner、payments、pricing、flags、
adapter、audit 等資料，但不能擴權。

## Short Summary

Implement executable `route.*`, `data.*`, `docs.*`, and `audit.*` read tools.

## Dependencies

- None

## Acceptance

- Tool registry exposes executable descriptors for navigation, route detail, tenant summaries, tenant governance, partners, payments/reimbursements, pricing, flags, adapters, and audit lookups.
- Every tool validates current Platform Admin actor scope before reading.
- Tool outputs are typed, bounded, redacted, and suitable for LLM context.
- API endpoint supports assistant tool invocation or internal tool loop invocation.
- Tests prove forbidden actor scope cannot read Platform Admin data.
- Tests prove large record sets are summarized/paginated instead of dumped.

## Artifacts

- `apps/api/src/modules/platform-admin/platform-admin-assistant.tools.ts`
- `apps/api/src/modules/platform-admin-assistant/`
- `packages/contracts/src/`
- `tests/unit/platform-admin-assistant-tools.test.ts`

## Guardrails

- Caller-scoped only; no service-account broad reads for assistant answers.
- Tool output must not contain secrets, plaintext credentials, or unrestricted PII.
- Use existing domain services and repositories instead of bypassing business rules.
