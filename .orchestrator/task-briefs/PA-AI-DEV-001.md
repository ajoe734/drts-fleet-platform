# Task Brief: PA-AI-DEV-001

Platform Admin assistant SA/SD and task-brief generator

- Status: `backlog`
- Owner: `Claude`
- Reviewer: `Codex`
- Planning Ref: `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
- Last Update: `2026-06-03T00:00:00Z`

## 中文說明

讓使用者在 Platform Admin 裡提出功能修改需求時，小幫手能根據目前系統內容與
文件脈絡產生 SA、SD、task briefs，並歸檔到 repo 的正式文件路徑。

## Short Summary

Generate archived SA/SD documents and supervisor-ready task briefs from feature
change requests.

## Dependencies

- `PA-AI-RAG-001` for citation-backed generation.

## Acceptance

- Requirement capture records user prompt, route context, visible system context, assumptions, and open questions.
- SA generator produces problem statement, actors, workflow, data, risk, and acceptance scenarios.
- SD generator produces architecture, API contract, state/migration impact, UI plan, tests, rollout, and rollback.
- Task brief generator emits supervisor-ready `.orchestrator/task-briefs/*.md` files with owner, reviewer, dependencies, artifacts, guardrails, and acceptance.
- Generated docs include citations to approved sources.
- Generated files require explicit human confirmation before write.
- Tests cover dry-run generation and file write confirmation behavior.

## Artifacts

- `apps/api/src/modules/platform-admin-assistant/`
- `docs/02-architecture/`
- `docs/05-ui/`
- `.orchestrator/task-briefs/`

## Guardrails

- Do not overwrite existing docs without explicit confirmation.
- Generated documents must mark assumptions and unresolved decisions.
- Keep task dependencies minimal; do not serialize work unnecessarily.
