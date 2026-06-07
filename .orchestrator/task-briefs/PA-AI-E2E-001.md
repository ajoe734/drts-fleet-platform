# Task Brief: PA-AI-E2E-001

Platform Admin agentic assistant live dev E2E and OpenClaw eval pack

- Status: `done`
- Owner: `Codex`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T15:23:15Z`

## 中文說明

建立完整驗收：以 OpenClaw 直接作為 assistant runtime，驗證真 provider、頁面上下文、讀資料、表單填寫、操作 preview/execute、SA/SD 產生、dispatch packet、supervisor status 與安全 eval。

## Short Summary

Owner finalized review-approved PA-AI-E2E-001 with formal closeout commit and normal push to origin/codex/pa-ai-e2e-001. Scoped verification remains environment-blocked in this isolated worktree: @drts/api vitest cannot resolve @nestjs/* and reflect-metadata, and Playwright…

## Dependencies

- `PA-AI-REAL-001`
- `PA-AI-CTX-001`
- `PA-AI-RAG-001`
- `PA-AI-TOOLS-001`
- `PA-AI-ACTION-001`
- `PA-AI-DEV-001`
- `PA-AI-INTG-001`
- `PA-AI-ORCH-001`
- `PA-AI-SEC-001`

## Acceptance

- Live dev smoke proves the OpenClaw-backed runtime provider is non-mock when a key is configured.
- E2E asks about /payments, verifies page context appears in the OpenClaw answer, and receives cited guidance.
- E2E invokes at least one caller-scoped read tool through OpenClaw and verifies bounded output.
- E2E proposes form fills and applies them only after user confirmation.
- E2E previews and executes one safe Platform Admin action, then verifies receipt and audit.
- E2E generates SA/SD/task brief dry-run artifacts from a feature-change request.
- E2E submits an OpenClaw-backed supervisor dispatch packet or dev worker run in dry-run mode and reads status.
- E2E captures watcher, guardrail, and prompt-injection evidence for the direct-adoption safety eval.

## Artifacts

- `tests/e2e/platform-admin-assistant-overlay.spec.ts`
- `tests/e2e/`
- `apps/api/tests/`
- `docs/04-uat/`

## Guardrails

- Use `scripts/ai-status.sh` or `python3 scripts/ai_status.py` for state changes.
- Treat `current-work.md` as a human summary, not canonical machine context.
