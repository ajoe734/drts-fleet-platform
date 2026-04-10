# AI Collaboration Guide

Last updated: 2026-04-10
Status: canonical collaboration rules for DRTS Phase 1 architecture bootstrap and later supervisor-managed execution

## 0. Repository Scope

You are in the `drts-fleet-platform` repo.

This repository contains:

- `.orchestrator/` for watcher, supervisor, permission broker, and worker adapters
- `scripts/` for status sync, dashboard helpers, and local orchestration commands
- `docs-site/` for the local dashboard
- root Phase 1 specification files
- extracted Phase 1 reference bundles for DB and LLM execution constraints

The current objective is:

> Turn the Phase 1 fleet management and dispatch compliance materials into a canonical repository architecture and a supervisor-ready execution baseline.

Current execution mode:

- `architect_bootstrap` is active now.
- During this mode, Codex may directly create or update canonical architecture, planning, and repo-structure artifacts.
- Supervisor and auto workers may run for visibility, but they must not be used to fan out development implementation tasks until the work breakdown has human-approved consensus.

## 1. Canonical Truth

Read these in order before starting work:

1. `AI_COLLABORATION_GUIDE.md`
2. `current-work.md`
3. `ai-status.json`
4. `CANONICAL_DOCUMENT_MAP.md`
5. `TARGET_ARCHITECTURE.md`
6. `ROADMAP.md`
7. `DEVELOPMENT_WORKBREAKDOWN.md`
8. `phase1_prd_detailed_v1.md`
9. `phase1_service_contracts_v1.md`
10. `phase1_system_analysis_v1.md` when product boundary details matter
11. `phase1_migration_plan_v1.md` and `phase1_openapi_v1.yaml` when rollout or API shape matters
12. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/*.md`
13. `phase1_db_migration_extracted/README.md`

Layered source of truth:

- `L0 Collaboration & State`: `AI_COLLABORATION_GUIDE.md`, `ai-status.json`, `ai-activity-log.jsonl`, `current-work.md`
- `L1 Local Architecture & Planning`: `CANONICAL_DOCUMENT_MAP.md`, `TARGET_ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT_WORKBREAKDOWN.md`, `PHASE1_DECISION_LEDGER.md`, `PHASE1_OPEN_QUESTIONS.md`
- `L2 Phase 1 Canonical Specs`: SA, PRD, service contracts, migration plan, OpenAPI
- `L3 Execution Constraints & Reference Bundles`: extracted LLM dev pack, extracted DB migration bundle, repo structure notes

Generated files must not outrank their machine-readable source.
Local architecture or planning docs must not override Phase 1 product semantics. When product-level files conflict, use the precedence declared in `CANONICAL_DOCUMENT_MAP.md` and `00_source_of_truth_and_glossary.md`.

## 2. Collaboration Model

### Capability Lanes

- `Claude`: governance review, architecture arbitration, control-plane oversight
- `Gemini`: runtime packaging, CI/CD, infra, worker operations
- `Codex`: contracts, schema, state-system, acceptance
- `Qwen`: integration, API implementation, adapters, acceptance
- `Copilot`: research ingestion, spec review, critique, external search

### Execution Modes

#### Mode A: Architect Bootstrap

- Active until human-approved consensus exists for the development work breakdown.
- Codex is allowed to build canonical repo structure, architecture docs, landing zones, and planning artifacts directly.
- Other LLMs may review or critique documents manually, but development task allocation does not go through supervisor yet.
- If a decision would add or change product semantics, stop and defer to human review.

Exit criteria for Mode B:

- canonical document map is stable
- target architecture is documented
- work breakdown is explicit enough to assign
- unresolved questions are isolated in `PHASE1_OPEN_QUESTIONS.md`
- human explicitly approves switching to supervised execution

#### Mode B: Supervisor-Managed Execution

- Once approved, development tasks are assigned through `ai-status.json` and the supervisor lifecycle.
- The pre-agreed work breakdown becomes the only source for auto-worker task creation.

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

During `architect_bootstrap`:

1. read the canonical map and target architecture first
2. update architecture, planning, and open-question artifacts directly when needed
3. isolate human-required product decisions instead of guessing
4. do not seed supervisor-owned development tasks yet

During `supervisor_managed_execution`:

1. review first
2. then finalize any `review_approved` tasks you own
3. then continue your `in_progress` tasks
4. then pick unblocked `todo` tasks you own
5. only then remain idle or log a blocker

If an auto worker repeatedly fails, the supervisor may retry, fallback, or reassign ownership/review to another lane.
