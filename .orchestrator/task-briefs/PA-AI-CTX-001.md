# Task Brief: PA-AI-CTX-001

Platform Admin assistant page/form/table context mesh v2

- Status: `backlog`
- Owner: `Claude2`
- Reviewer: `Codex`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

讓小幫手能理解目前 Platform Admin 頁面的 route、tab、visible records、form
fields、validation errors、selected rows、available actions，而不是只送 pathname。

## Short Summary

Create a bounded assistant-readable context packet for Platform Admin pages and
forms.

## Dependencies

- None

## Acceptance

- Context packet schema `platform_admin_assistant_context.v2` is documented and typed.
- Current route context includes pathname, page title, active tab, refresh tier, visible entity refs, and warnings.
- Form registry exposes field labels, values, validation errors, dirty state, and allowed assistant-fill behavior.
- Table/list registry exposes bounded visible rows and selected records without dumping entire datasets.
- Assistant overlay sends context packet separately from raw user prompt or with a clearly delimited context envelope.
- Unit or e2e tests verify `/payments`, `/tenants`, `/partners`, and `/pricing` context packets.

## Artifacts

- `apps/platform-admin-web/components/assistant/route-context.ts`
- `apps/platform-admin-web/components/assistant/`
- `apps/platform-admin-web/app/**/page.tsx`
- `tests/e2e/platform-admin-assistant-overlay.spec.ts`

## Guardrails

- Do not use arbitrary DOM scraping as source of truth.
- Keep context bounded and redacted.
- Sensitive data must come from caller-scoped API read tools, not raw DOM dumps.
