# Task Brief: PA-AI-ACTION-001

Platform Admin assistant governed action execution

- Status: `backlog`
- Owner: `Codex2`
- Reviewer: `Claude2`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

讓小幫手可以完成系統操作，但所有寫入都必須走 preview -> confirmation ->
execute -> receipt，不允許直接繞過 UI/domain policy。

## Short Summary

Build the governed write-action lifecycle and chat confirmation UX.

## Dependencies

- `PA-AI-TOOLS-001` for full domain read/write context.

## Acceptance

- Action lifecycle supports preview, risk descriptor, required reason, confirmation, execute, and receipt.
- Chat UI renders action proposal cards and confirmation panels.
- Existing actions `create_platform_notice` and `set_maintenance_mode` use the new lifecycle.
- At least two additional Platform Admin write actions are implemented or stubbed behind disabled descriptors.
- Medium/high risk actions cannot execute without explicit confirmation.
- High risk actions require a non-empty reason.
- Domain audit and assistant audit are both written for executed actions.
- E2E covers preview and confirmed execution for one safe dev action.

## Artifacts

- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.actions.ts`
- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.service.ts`
- `apps/platform-admin-web/components/assistant/AssistantConfirmationPanel.tsx`
- `apps/platform-admin-web/components/assistant/AssistantReceiptCard.tsx`
- `tests/e2e/platform-admin-assistant-overlay.spec.ts`

## Guardrails

- Do not let provider text execute actions directly.
- All tool payloads must be schema validated before preview or execution.
- Keep rollback guidance visible for high-risk changes.
