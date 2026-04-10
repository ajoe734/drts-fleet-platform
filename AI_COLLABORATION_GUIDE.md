# AI Collaboration Guide

Last updated: 2026-04-10
Status: canonical collaboration rules for the Portable Orchestrator Bundle project

## 0. Repository Scope

You are in the `portable-orchestrator-bundle` repo.

This repository uses the portable orchestrator bundle:

- `.orchestrator/` for watcher, supervisor, permission broker, and worker adapters
- `scripts/` for status sync and dashboard helpers
- `docs-site/` for the local dashboard

The system objective is:

> Stand up a shared multi-LLM delivery system with a supervisor, auto workers, and a live dashboard.

## 1. Canonical Truth

Read these in order before starting work:

1. `AI_COLLABORATION_GUIDE.md`
2. `current-work.md`
3. `ai-status.json`
4. `ai-activity-log.jsonl`
5. `docs-site/index.html`

Layered source of truth:

- `L0 Collaboration & State`: `AI_COLLABORATION_GUIDE.md`, `ai-status.json`, `ai-activity-log.jsonl`, `current-work.md`
- `L1 Runtime & Dashboard`: `docs-site/index.html`

Generated files must not outrank their machine-readable source.
This bundle only seeds the collaboration/control-plane layer. As the repo gains project-specific architecture, backlog, or policy docs, update this file and `ai-status.json` so the canonical read order matches the new project instead of the source repo.

## 2. Collaboration Model

### Capability Lanes

- `Claude`: execution plane, control plane, governance review
- `Gemini`: cloud/runtime packaging, CI/CD, worker operations
- `Codex`: contracts, state system, schema, acceptance
- `Qwen`: integration, schema, acceptance, code-agent execution
- `Copilot`: coding assist, research ingestion, external search, critique

### Task Ownership

Rules:

- each task has exactly one `owner`
- `reviewer` cannot equal `owner`
- blocked tasks must include `waiting_for`
- every task must pass through `review -> review_approved -> done`
- direct `done` from `todo` or `in_progress` is not allowed
- only the `reviewer` may move a task into `review_approved`
- only the `owner` may finalize a `review_approved` task into `done`

Lifecycle:

- `todo` / `in_progress`: owner implementation work
- `review`: reviewer must either approve or request concrete changes
- `review_approved`: reviewer gate passed; the task returns to the owner for finalization
- `done`: owner has formally closed the task

## 3. Status Commands

Use the status script instead of editing multiple files manually.

```bash
AI_NAME=Codex ./scripts/ai-status.sh assign <task-id> <owner> <reviewer> "Optional title"
AI_NAME=Codex ./scripts/ai-status.sh start <task-id> "Started implementation"
AI_NAME=Codex ./scripts/ai-status.sh progress <task-id> "Updated progress"
AI_NAME=Codex ./scripts/ai-status.sh handoff <task-id> Claude "Ready for review"
AI_NAME=Claude REVIEW_NOTES_ZH="審查通過||回到 owner 收尾" ./scripts/ai-status.sh approve <task-id> "Review approved and returned to the owner for finalization"
AI_NAME=Codex ./scripts/ai-status.sh done <task-id> "Owner finalized approved task and closed it"
./scripts/sync-state.sh
```

## 4. Local Runtime

Run locally from the repository root only:

```bash
bash scripts/setup-llm-cli.sh
bash scripts/run-supervisor.sh --verbose
bash scripts/run-dashboard.sh
```

The dashboard will be served at `http://127.0.0.1:4173/index.html` unless you override `PORT`.

## 5. Work Order For Every LLM

1. review first
2. then finalize any `review_approved` tasks you own
3. then continue your `in_progress` tasks
4. then pick unblocked `todo` tasks you own
5. only then remain idle or log a blocker

If an auto worker repeatedly fails, the supervisor may retry, fallback, or reassign ownership/review to another lane.
