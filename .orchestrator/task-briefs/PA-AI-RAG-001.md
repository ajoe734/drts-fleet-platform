# Task Brief: PA-AI-RAG-001

Platform Admin assistant RAG and citation integration

- Status: `backlog`
- Owner: `Codex`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

把 approved docs retrieval 串進真實 assistant response，讓回答能依據 Platform
Admin 設計文件、SA/SD、runbook、task brief 引用來源，並防止 doc prompt
injection。

## Short Summary

Wire approved-source retrieval into provider prompts and enforce citation-backed
answers.

## Dependencies

- None

## Acceptance

- Approved source allowlist includes Platform Admin assistant plan, design handoff, body parity docs, SA/SD docs, runbooks, and generated task briefs.
- Retrieval returns compact excerpts with stable citations and source metadata.
- Provider request includes retrieved excerpts as untrusted cited context.
- Prompt-injection tests cover malicious docs, malicious page text, and malicious tool output.
- Assistant response includes citations when docs influence the answer.
- Missing source coverage produces a transparent "not enough approved context" response.

## Artifacts

- `apps/api/src/modules/platform-admin-assistant/knowledge/`
- `apps/api/src/modules/platform-admin-assistant/`
- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- `tests/unit/platform-admin-assistant-*.test.ts`

## Guardrails

- Do not include full large docs in provider context.
- Do not let retrieved text override system/developer/tool policy.
- Redact secrets before retrieval output reaches the provider.
