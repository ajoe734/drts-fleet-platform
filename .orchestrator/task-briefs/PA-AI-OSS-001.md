# Task Brief: PA-AI-OSS-001

OpenClaw direct runtime adoption plan

- Status: `in_progress`
- Owner: `Codex2`
- Reviewer: `Claude`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T13:41:55Z`

## 中文說明

把 OpenClaw 作為 Platform Admin assistant 與 dev worker 的主 agent runtime，
定義 direct adoption 下的安全邊界、整合模式、落地順序與 adoption plan。

## Short Summary

Reset the decision and define OpenClaw-first runtime adoption with DRTS-owned
guardrails around credentials, tooling, audit, filesystem scope, and task
control-plane mapping.

## Dependencies

- None

## Acceptance

- Architecture docs clearly switch to direct OpenClaw adoption and remove
  pattern-only as the default recommendation.
- Document credential, tooling, audit, and filesystem boundaries for direct
  adoption.
- Define pilot and phase ordering for dev workers, assistant runtime, and
  orchestrator bridge integration.
- Map OpenClaw runtime concerns onto DRTS control-plane owners and guardrails.
- Align task briefs and board-facing summaries to the OpenClaw-first direction.
- Findings are archived in `docs/02-architecture/` or `docs/05-ui/`.

## Artifacts

- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- `docs/02-architecture/`
- `.orchestrator/`

## Guardrails

- Do not store DRTS secrets in OpenClaw config, plugin bundles, or persistent
  runtime homes.
- Do not let OpenClaw mutate canonical task truth except through approved
  status scripts.
- Do not give OpenClaw direct unrestricted Platform Admin write authority.
