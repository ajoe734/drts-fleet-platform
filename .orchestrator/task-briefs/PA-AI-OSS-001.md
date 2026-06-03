# Task Brief: PA-AI-OSS-001

OpenClaw-style OSS agent runtime evaluation

- Status: `backlog`
- Owner: `Gemini2`
- Reviewer: `Codex`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

評估是否導入 OpenClaw 或 OpenClaw-style runtime 作為 dev-side worker/agent
sidecar。這個 task 不阻塞 DRTS-owned assistant gateway；重點是做安全邊界、
整合模式、POC 與採用建議。

## Short Summary

Evaluate OpenClaw-style architecture for a sandboxed development-side agent
runner behind the DRTS orchestrator bridge.

## Dependencies

- None

## Acceptance

- Compare direct adoption, sidecar adoption, and no adoption / pattern-only options.
- Document installation/runtime footprint, provider/key storage, channel/session model, CLI invocation, and tool permission model.
- Produce a security threat model for local files, shell, cloud credentials, Platform Admin API tokens, and prompt injection.
- If POC is feasible, run only in an isolated worktree with no DRTS production/dev secrets.
- Recommendation states whether `PA-AI-ORCH-001` should use OpenClaw directly, wrap it as an optional runner, or avoid it.
- Findings are archived in `docs/02-architecture/` or `docs/05-ui/` with citations.

## Artifacts

- `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- `docs/02-architecture/`
- `.orchestrator/`

## Guardrails

- Do not store DRTS secrets in an OSS agent config.
- Do not give OSS runtime direct Platform Admin write tokens.
- Do not make this evaluation a dependency for real provider or read-only assistant work.
